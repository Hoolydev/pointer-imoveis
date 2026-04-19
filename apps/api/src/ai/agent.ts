import { z } from "zod";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getLLM, type ChatMsg, type ContentPart } from "./client";
import { runGraphTurn, type CampaignToolConfig, type CampaignFile } from "./graph";

export const extractionSchema = z.object({
  name: z.string().optional().default(""),
  interest: z.string().optional().default(""),
  budget: z.string().optional().default(""),
  timeline: z.string().optional().default(""),
  temperature: z.enum(["hot", "warm", "cold"]).default("cold"),
  score: z.number().int().min(0).max(100).default(0),
});
export type Extraction = z.infer<typeof extractionSchema>;

const HISTORY_LIMIT = 20;

const HANDOFF_KEYWORDS = [
  /falar com (um )?(humano|atendente|vendedor|corretor|pessoa)/i,
  /quero (um )?atendente/i,
  /me liga|liga(r)? para mim|me chama no telefone/i,
  /financiamento (com|de) entrada/i,
];

export const REPLY_SYSTEM_SUFFIX = `

## COMPORTAMENTO GERAL (SDR HUMANIZADO)
- Sempre seja amigável, persuasivo e escreva como um humano natural no WhatsApp.
- Não envie blocos de texto gigantescos de uma vez. Divida suas ideias usando quebras de linha duplas (\\n\\n) para simular o comportamento de uma pessoa enviando múltiplas mensagens curtas em sequência.
- Remova pontos finais rígidos ao final de mensagens isoladas para parecer mais orgânico e coloquial.
- Faça as perguntas de qualificação UMA POR VEZ, de forma muito fluida e orgânica, sempre encadeando com o contexto atual da conversa.
- Mantenha itens de lista e benefícios juntos, NUNCA quebre listas ao meio.
- Se responda sempre no idioma que o lead está usando.
`;

const EXTRACT_SYSTEM = `You are an analyst. Read the conversation and extract qualification data.

Score 0-100:
- 0-30 cold (low engagement, vague)
- 31-70 warm (engaged, asking questions or providing partial info)
- 71-89 hot (clear intent, but qualification is still in progress / missing details)
- 90-100 fully qualified (clear intent AND all qualification questions or necessary details have been collected)

Return ONLY JSON:
{"name":"","interest":"","budget":"","timeline":"","temperature":"cold|warm|hot","score":0}`;

export interface AgentTurn {
  reply: string | null;
  extraction: Extraction;
  handoff: boolean;
  handoffReason?: string;
  filesToSend?: Array<{ url: string; type: "image" | "video" | "document"; caption?: string }>;
}

/**
 * Process one inbound message for a lead.
 * When enabledTools are configured, uses LangGraph ReAct agent (Secretária v3).
 * Otherwise falls back to the simple two-step completion for speed/cost.
 */
export async function runAgentTurn(params: {
  leadId: string;
  systemPrompt: string;
  inboundText: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  mediaFileName?: string;
  enabledTools?: CampaignToolConfig;
  campaignFiles?: CampaignFile[];
  calendarId?: string;
}): Promise<AgentTurn> {
  const {
    leadId,
    systemPrompt,
    inboundText,
    mediaUrl,
    mediaType,
    mediaFileName,
    enabledTools,
    campaignFiles,
    calendarId,
  } = params;

  // Keyword-based handoff short-circuit (always active, regardless of tools)
  for (const re of HANDOFF_KEYWORDS) {
    if (re.test(inboundText)) {
      return {
        reply: null,
        extraction: extractionSchema.parse({}),
        handoff: true,
        handoffReason: "keyword",
        filesToSend: [],
      };
    }
  }

  // Determine whether any tools are enabled for this campaign
  const hasTools =
    enabledTools &&
    (enabledTools.files || enabledTools.calendar || enabledTools.escalation);

  let reply: string | null;
  let handoff = false;
  let handoffReason: string | undefined;
  let filesToSend: AgentTurn["filesToSend"] = [];

  if (hasTools) {
    // ── LangGraph ReAct agent with tools ──────────────────────────────────
    const graphResult = await runGraphTurn({
      leadId,
      systemPrompt,
      inboundText,
      enabledTools,
      campaignFiles,
      calendarId,
    });
    reply = graphResult.reply;
    handoff = graphResult.handoff;
    handoffReason = graphResult.handoffReason;
    filesToSend = graphResult.filesToSend;
  } else {
    // ── Simple two-step completion (no tools) ─────────────────────────────
    const history = await prisma.message.findMany({
      where: { leadId },
      orderBy: { timestamp: "desc" },
      take: HISTORY_LIMIT,
    });
    history.reverse();

    const chatHistory: ChatMsg[] = history.map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    // Build current user message (may include media)
    let currentUserContent: string | ContentPart[] = inboundText;

    if (mediaUrl) {
      const parts: ContentPart[] = [];
      if (inboundText) parts.push({ type: "text", text: inboundText });

      if (mediaType === "image") {
        parts.push({ type: "image_url", image_url: { url: mediaUrl, detail: "auto" } });
        if (!inboundText) parts.push({ type: "text", text: "[Usuário enviou uma imagem]" });
      } else if (mediaType === "video") {
        parts.push({ type: "text", text: `[Usuário enviou um vídeo: ${mediaUrl}]` });
      } else if (mediaType === "document") {
        parts.push({ type: "text", text: `[Usuário enviou um documento: ${mediaFileName ?? "arquivo"}]` });
      } else if (mediaType === "audio") {
        if (!inboundText) parts.push({ type: "text", text: "[Usuário enviou um áudio não transcrito]" });
      }

      currentUserContent = parts;
    }

    const lastMsg = chatHistory.at(-1);
    const lastContent = typeof lastMsg?.content === "string" ? lastMsg.content : inboundText;
    if (lastContent !== inboundText || mediaUrl) {
      chatHistory.push({ role: "user", content: currentUserContent });
    }

    const llm = getLLM();
    reply = (
      await llm.chat(
        [{ role: "system", content: systemPrompt + REPLY_SYSTEM_SUFFIX }, ...chatHistory],
        { temperature: 0.6 }
      )
    ).trim();
  }

  // ── Extraction (always runs after reply) ──────────────────────────────────
  let extraction: Extraction = extractionSchema.parse({});

  try {
    // Build extraction history from DB (consistent regardless of path above)
    const history = await prisma.message.findMany({
      where: { leadId },
      orderBy: { timestamp: "desc" },
      take: HISTORY_LIMIT,
    });
    history.reverse();
    const historyForExtract: ChatMsg[] = history.map((m) => ({
      role: m.direction === "inbound" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));
    historyForExtract.push({ role: "user", content: inboundText });
    if (reply) historyForExtract.push({ role: "assistant", content: reply });

    const llm = getLLM();
    const raw = await llm.chat(
      [{ role: "system", content: EXTRACT_SYSTEM }, ...historyForExtract],
      { temperature: 0, json: true }
    );
    const parsed = extractionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) extraction = parsed.data;
  } catch (err) {
    logger.warn({ err }, "agent: extraction failed");
  }

  // Score-based handoff overrides tool-based handoff
  if (!handoff && extraction.score >= 90) {
    handoff = true;
    handoffReason = `score=${extraction.score} temp=${extraction.temperature}`;
  }

  return {
    reply,
    extraction,
    handoff,
    handoffReason,
    filesToSend,
  };
}

export async function generateFollowUp(params: {
  leadId: string;
  leadName?: string;
  systemPrompt?: string;
}): Promise<string> {
  const { leadId, leadName, systemPrompt } = params;
  const history = await prisma.message.findMany({
    where: { leadId },
    orderBy: { timestamp: "desc" },
    take: HISTORY_LIMIT,
  });
  history.reverse();
  const chatHistory: ChatMsg[] = history.map((m) => ({
    role: m.direction === "inbound" ? "user" : "assistant",
    content: m.content,
  }));

  const llm = getLLM();
  const basePrompt = systemPrompt || "You are a helpful sales assistant.";
  const generatePrompt = `${basePrompt}
The lead has not replied to the latest message. Write a short, polite, engaging follow-up message to revive the conversation.
${leadName ? `Call the lead by their name: ${leadName}.` : ""}
Do not be pushy. Max 3 sentences or 40 words.`;

  const reply = await llm.chat(
    [{ role: "system", content: generatePrompt }, ...chatHistory],
    { temperature: 0.7 }
  );
  return reply.trim();
}
