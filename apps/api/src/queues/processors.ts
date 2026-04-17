import type { Job } from "bullmq";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getProvider, type ProviderConfig } from "../providers";
import type { MediaType } from "../providers/types";
import { runAgentTurn, generateFollowUp } from "../ai/agent";
import { type CampaignJobData, type InboundJobData, campaignQueue } from "./index";
import * as crm from "../services/crm.service";
import { pickBrokerForLead } from "../services/broker.service";

const TEMP_TO_CRM: Record<string, number> = { cold: 0, warm: 1, hot: 2 };
const NO_CRM_TYPES = new Set(["cobranca"]);

/** Processes one outbound campaign message job */
export async function campaignProcessor(job: Job<CampaignJobData>) {
  const { leadId, campaignId, variationIndex, type = "blast", followUpIndex = 0 } = job.data;

  let [lead, campaign] = await Promise.all([
    prisma.lead.findUnique({ where: { id: leadId } }),
    prisma.campaign.findUnique({ where: { id: campaignId } }),
  ]);

  if (!lead || !campaign) {
    throw new Error(`Lead or campaign not found: ${leadId} / ${campaignId}`);
  }
  if (campaign.status === "paused" || campaign.status === "done") {
    logger.info({ campaignId }, "campaign stopped, skipping job");
    return;
  }

  // Reactivation campaigns are allowed to re-engage handoff leads
  if (lead.handoff) {
    if (campaign.type === "reactivation") {
      // Reset handoff so the AI can respond to replies again
      await prisma.lead.update({
        where: { id: leadId },
        data: { handoff: false, status: "engaged", activeCampaignId: campaignId },
      });
      lead = { ...lead, handoff: false, status: "engaged", activeCampaignId: campaignId };
      logger.info({ leadId }, "reactivation: handoff reset, IA reativada");
    } else {
      logger.info({ leadId }, "lead in handoff, skipping send");
      return;
    }
  }

  let message = "";

  if (type === "followup") {
    const lastOutbound = await prisma.message.findFirst({
      where: { leadId, campaignId, direction: "outbound" },
      orderBy: { timestamp: "desc" },
    });
    const recentInbound = await prisma.message.findFirst({
      where: {
        leadId,
        direction: "inbound",
        timestamp: { gt: lastOutbound?.timestamp || new Date(0) },
      },
    });

    if (recentInbound) {
      logger.info({ leadId }, "Lead already replied, aborting follow-up");
      return;
    }

    message = await generateFollowUp({
      leadId,
      leadName: lead.name || undefined,
      systemPrompt: campaign.systemPrompt,
    });
  } else {
    const variations = (campaign.variations as string[] | null) ?? [campaign.baseMessage];
    let rawMessage = variations[variationIndex % variations.length];
    if (lead.name) rawMessage = rawMessage.replace(/\{nome\}|@\[nome\]/gi, lead.name);
    message = rawMessage;
  }

  const providerConfig = campaign.providerConfig as ProviderConfig | null;
  const provider = getProvider(campaign.provider, providerConfig ?? undefined);

  const msg = await prisma.message.create({
    data: {
      leadId,
      campaignId,
      content: message,
      direction: "outbound",
      status: "pending",
    },
  });

  try {
    const mediaUrl = (campaign as any).mediaUrl as string | null;
    const mediaType = (campaign as any).mediaType as MediaType | null;
    const result = (type !== "followup" && mediaUrl && mediaType && provider.sendMedia)
      ? await provider.sendMedia(lead.phone, mediaUrl, mediaType, message)
      : await provider.sendMessage(lead.phone, message);
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: "sent", providerMessageId: result.id },
    });
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastInteraction: new Date(), status: "engaged", activeCampaignId: campaignId },
    });
    logger.info({ leadId, campaignId, msgId: msg.id }, "message sent");

    // CRM: on first blast message, create the deal and move to "Prospecção" (first stage)
    // Skipped for campaigns that opt out of CRM (e.g. cobranca)
    if (type !== "followup" && followUpIndex === 0 && !NO_CRM_TYPES.has(campaign.type)) {
      let crmClienteId = lead.crmClienteId;

      if (!crmClienteId) {
        crmClienteId = await crm.addNegocio({
          nome: lead.name || lead.phone,
          phone: lead.phone,
          temperature: TEMP_TO_CRM[lead.temperature] ?? 0,
        });
        if (crmClienteId) {
          await prisma.lead.update({ where: { id: leadId }, data: { crmClienteId } });
        }
      }

      if (crmClienteId) {
        await crm.moveLeadToStage(crmClienteId, "first").catch(
          (err) => logger.warn({ err, leadId }, "CRM: falha ao mover para Prospecção")
        );
      }
    }

    // Queue next follow-up if applicable
    if (campaign.followUpDelays && campaign.followUpDelays.length > followUpIndex) {
      const hoursToWait = campaign.followUpDelays[followUpIndex];
      const nextFollowUp = followUpIndex + 1;
      const delayMs = hoursToWait * 60 * 60 * 1000;
      await campaignQueue.add(
        `followup-${leadId}-${nextFollowUp}`,
        { leadId, campaignId, variationIndex: 0, type: "followup", followUpIndex: nextFollowUp },
        { delay: delayMs, attempts: 3, backoff: { type: "exponential", delay: 5000 } }
      );
      logger.info({ leadId, delayHour: hoursToWait, nextFollowUp }, "Scheduled follow-up");
    }
  } catch (err: any) {
    await prisma.message.update({
      where: { id: msg.id },
      data: { status: "failed", error: err?.message?.slice(0, 255) },
    });
    throw err; // BullMQ will retry
  }
}

/** Processes one inbound message — runs agent and sends reply */
export async function inboundProcessor(job: Job<InboundJobData>) {
  const { leadId, inboundText, inboundMessageId, mediaUrl, mediaType, mediaFileName } = job.data;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error(`Lead not found: ${leadId}`);

  if (lead.handoff) {
    logger.info({ leadId }, "lead in handoff, skipping agent");
    return;
  }

  // Cobrança campaigns do not respond to inbound messages via AI
  if (lead.activeCampaignId) {
    const activeCampaign = await prisma.campaign.findUnique({
      where: { id: lead.activeCampaignId },
      select: { type: true },
    });
    if (activeCampaign && NO_CRM_TYPES.has(activeCampaign.type)) {
      logger.info({ leadId, type: activeCampaign.type }, "cobrança campaign: skipping AI reply");
      return;
    }
  }

  let systemPrompt = "You are a helpful sales assistant. Qualify the lead by asking about their needs.";
  if (lead.activeCampaignId) {
    const campaign = await prisma.campaign.findUnique({ where: { id: lead.activeCampaignId } });
    if (campaign?.systemPrompt) systemPrompt = campaign.systemPrompt;

    if (campaign?.qualifyQuestions && Array.isArray(campaign.qualifyQuestions) && campaign.qualifyQuestions.length > 0) {
      systemPrompt += `\n\n## Perguntas de Qualificação Pendentes:\nConduzindo a conversa naturalmente, descubra as seguintes informações do cliente (uma por vez, dentro do assunto):\n${campaign.qualifyQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
    }

    // IA Receptiva: inject property portfolio and extra info into context
    if (campaign?.type === "inbound") {
      const properties = campaign.properties as Array<{ id: string; name: string; description?: string; link?: string }> | null;
      if (properties && properties.length > 0) {
        const propList = properties
          .map((p) => `- **${p.name}**${p.description ? `: ${p.description}` : ""}${p.link ? ` | Link: ${p.link}` : ""}`)
          .join("\n");
        systemPrompt += `\n\n## Imóveis em Carteira:\n${propList}`;
      }
      if ((campaign as any).extraInfo) {
        systemPrompt += `\n\n## Informações Adicionais:\n${(campaign as any).extraInfo}`;
      }
      if ((campaign as any).calendarEnabled) {
        systemPrompt += `\n\n## Agendamento de Visitas:\nQuando o cliente demonstrar interesse em visitar um imóvel, pergunte a disponibilidade de data e horário e informe que o corretor irá confirmar o agendamento.`;
      }
    }
  }

  // Persist inbound message
  const existing = await prisma.message.findFirst({
    where: { leadId, providerMessageId: inboundMessageId },
  });
  if (!existing) {
    await prisma.message.create({
      data: {
        leadId,
        content: inboundText,
        direction: "inbound",
        status: "delivered",
        providerMessageId: inboundMessageId,
      },
    });
  }

  // CRM: on first reply from lead, move to "Contato com o Cliente"
  if (lead.crmClienteId) {
    const inboundCount = await prisma.message.count({
      where: { leadId, direction: "inbound" },
    });
    if (inboundCount <= 1) {
      crm.moveLeadToStage(lead.crmClienteId, "contato").catch(
        (err) => logger.warn({ err, leadId }, "CRM: falha ao mover para Contato com o Cliente")
      );
    }
  }

  // Transcribe audio before passing to agent
  let resolvedText = inboundText;
  if (mediaType === "audio" && mediaUrl) {
    try {
      const { getLLM } = await import("../ai/client");
      resolvedText = await getLLM().transcribeAudio(mediaUrl);
      logger.info({ leadId }, "audio transcribed via Whisper");
    } catch (err) {
      logger.warn({ err, leadId }, "audio transcription failed, using empty text");
    }
  }

  const turn = await runAgentTurn({
    leadId,
    systemPrompt,
    inboundText: resolvedText,
    mediaUrl: mediaType !== "audio" ? mediaUrl : undefined,
    mediaType: mediaType !== "audio" ? mediaType : undefined,
    mediaFileName,
  });

  // Update lead scoring/status
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      lastInteraction: new Date(),
      status: turn.handoff ? "qualified" : "engaged",
      handoff: turn.handoff,
      temperature: turn.extraction.temperature,
      score: turn.extraction.score,
      metadata: {
        ...(lead.metadata as object),
        name: turn.extraction.name || undefined,
        interest: turn.extraction.interest || undefined,
        budget: turn.extraction.budget || undefined,
        timeline: turn.extraction.timeline || undefined,
      },
    },
  });

  if (turn.handoff) {
    logger.info({ leadId, reason: turn.handoffReason }, "lead qualificado para handoff");

    // Assign broker if not already assigned
    let brokerId = lead.brokerId;
    if (!brokerId) {
      brokerId = await pickBrokerForLead();
      if (brokerId) {
        await prisma.lead.update({ where: { id: leadId }, data: { brokerId } });
      }
    }

    // CRM: move to "Lead Qualificado" + assign broker
    if (lead.crmClienteId) {
      crm.handleQualifiedHandoff(lead.crmClienteId, brokerId).catch(
        (err) => logger.warn({ err, leadId }, "CRM: falha no handoff qualificado")
      );
    }
    return;
  }

  if (!turn.reply) return;

  // Humanization: split reply by double newlines to simulate multiple typed messages
  const provider = getProvider();
  const rawReplyStr = String(turn.reply).replace(/\\n\\n/g, "\n\n");
  const chunks = rawReplyStr.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    if (i > 0) {
      const waitTime = Math.min(2000 + chunk.length * 40, 10000);
      await new Promise((r) => setTimeout(r, waitTime));
    }

    const replyMsg = await prisma.message.create({
      data: {
        leadId,
        content: chunk,
        direction: "outbound",
        status: "pending",
        campaignId: lead.activeCampaignId ?? undefined,
      },
    });

    try {
      const result = await provider.sendMessage(lead.phone, chunk);
      await prisma.message.update({
        where: { id: replyMsg.id },
        data: { status: "sent", providerMessageId: result.id },
      });
    } catch (err: any) {
      await prisma.message.update({
        where: { id: replyMsg.id },
        data: { status: "failed", error: err?.message?.slice(0, 255) },
      });
      logger.error({ err, leadId, msgId: replyMsg.id }, "failed to send inbound reply chunk");
      break;
    }
  }
}
