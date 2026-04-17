import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { generateVariations, pickVariationIndex } from "../ai/variation";
import { campaignQueue } from "../queues/index";

export interface ProviderConfigInput {
  baseUrl?: string;
  token?: string;
  instance?: string;
  phoneId?: string;
}

export interface CreateCampaignInput {
  name: string;
  type?: string;
  baseMessage?: string;
  systemPrompt?: string;
  provider?: string;
  providerConfig?: ProviderConfigInput;
  delayMs?: number;
  maxPerMinute?: number;
  qualifyQuestions?: string[];
  handoffScore?: number;
  handoffMessage?: string;
  maxConvHours?: number;
  followUpDelays?: number[];
  // IA Receptiva
  properties?: Array<{ id: string; name: string; description?: string; link?: string }>;
  extraInfo?: string;
  calendarEnabled?: boolean;
  calendarMainId?: string | null;
  brokerCalendars?: Array<{ brokerId: string; calendarId: string }>;
}

export async function createCampaign(input: CreateCampaignInput) {
  const campaign = await prisma.campaign.create({
    data: {
      name: input.name,
      type: input.type ?? "blast",
      baseMessage: input.baseMessage ?? "",
      systemPrompt: input.systemPrompt ?? "",
      provider: input.provider ?? process.env.WHATSAPP_PROVIDER ?? "uazapi",
      providerConfig: input.providerConfig ?? undefined,
      delayMs: input.delayMs ?? 3000,
      maxPerMinute: input.maxPerMinute ?? 20,
      status: "draft",
      qualifyQuestions: input.qualifyQuestions ?? undefined,
      handoffScore: input.handoffScore ?? undefined,
      handoffMessage: input.handoffMessage ?? undefined,
      maxConvHours: input.maxConvHours ?? undefined,
      followUpDelays: input.followUpDelays ?? [],
      properties: input.properties ?? undefined,
      extraInfo: input.extraInfo ?? undefined,
      calendarEnabled: input.calendarEnabled ?? false,
      calendarMainId: input.calendarMainId ?? undefined,
      brokerCalendars: input.brokerCalendars ?? undefined,
    },
  });

  // Generate and store variations eagerly (inbound campaigns have no baseMessage)
  if (input.baseMessage) {
    generateVariations(input.baseMessage)
      .then((variations) =>
        prisma.campaign.update({ where: { id: campaign.id }, data: { variations } })
      )
      .catch((err) => logger.error({ err, campaignId: campaign.id }, "variation gen failed"));
  }

  return campaign;
}

export async function updateCampaign(campaignId: string, input: Partial<CreateCampaignInput>) {
  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      name: input.name,
      type: input.type,
      baseMessage: input.baseMessage,
      systemPrompt: input.systemPrompt,
      provider: input.provider,
      providerConfig: input.providerConfig ?? undefined,
      delayMs: input.delayMs,
      maxPerMinute: input.maxPerMinute,
      qualifyQuestions: input.qualifyQuestions ?? undefined,
      handoffScore: input.handoffScore ?? undefined,
      handoffMessage: input.handoffMessage ?? undefined,
      maxConvHours: input.maxConvHours ?? undefined,
      followUpDelays: input.followUpDelays ?? undefined,
      properties: input.properties ?? undefined,
      extraInfo: input.extraInfo ?? undefined,
      calendarEnabled: input.calendarEnabled,
      calendarMainId: input.calendarMainId,
      brokerCalendars: input.brokerCalendars ?? undefined,
    },
  });

  if (input.baseMessage) {
    generateVariations(input.baseMessage)
      .then((variations) => prisma.campaign.update({ where: { id: campaign.id }, data: { variations } }))
      .catch((err) => logger.error({ err, campaignId: campaign.id }, "variation gen failed"));
  }

  return campaign;
}

export async function startCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });

  if (!["draft", "paused"].includes(campaign.status)) {
    throw new Error(`Campaign is ${campaign.status}, cannot start`);
  }

  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "running" } });

  // Inbound/IA Receptiva campaigns activate passively — no outbound jobs to queue
  if (campaign.type === "inbound") {
    logger.info({ campaignId }, "inbound campaign activated");
    return { queued: 0 };
  }

  // Load all campaign leads
  const links = await prisma.campaignLead.findMany({
    where: { campaignId },
    include: { lead: true },
    orderBy: { enqueuedAt: "asc" },
  });

  const variations = (campaign.variations as string[] | null) ?? [campaign.baseMessage];
  const jitter = (delay: number) => delay * (0.8 + Math.random() * 0.4); // ±20%

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    // Skip leads already messaged in last 24h (dedup guard)
    const recent = await prisma.message.findFirst({
      where: {
        leadId: link.leadId,
        direction: "outbound",
        status: "sent",
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (recent) continue;

    const delay = Math.round(jitter(campaign.delayMs) * i);
    await campaignQueue.add(
      `send-${link.leadId}`,
      { leadId: link.leadId, campaignId, variationIndex: pickVariationIndex(i, variations.length) },
      {
        delay,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      }
    );
  }

  logger.info({ campaignId, jobsQueued: links.length }, "campaign started");
  return { queued: links.length };
}

export async function pauseCampaign(campaignId: string) {
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "paused" } });
  // BullMQ will still process in-flight jobs; the processor checks campaign.status
  return { ok: true };
}

export async function getCampaignMetrics(campaignId: string) {
  const [total, sent, failed, pending, replies] = await Promise.all([
    prisma.campaignLead.count({ where: { campaignId } }),
    prisma.message.count({ where: { campaignId, direction: "outbound", status: "sent" } }),
    prisma.message.count({ where: { campaignId, direction: "outbound", status: "failed" } }),
    prisma.message.count({ where: { campaignId, direction: "outbound", status: "pending" } }),
    prisma.message.count({ where: { campaignId, direction: "inbound" } }),
  ]);
  const replyRate = sent > 0 ? Math.round((replies / sent) * 100) : 0;
  return { total, sent, failed, pending, replies, replyRate };
}
