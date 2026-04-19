/**
 * LangGraph-inspired AI agent (Secretária v3 port).
 *
 * Implements a ReAct (Reasoning + Acting) graph with three node types:
 *   agent_node  → calls LLM with tool definitions
 *   tools_node  → executes requested tools and appends results
 *   extract_node→ extracts qualification data after conversation
 *
 * Uses OpenAI function calling natively (same runtime, no extra module-resolution
 * complexity). Tools are opt-in per campaign via enabledTools config:
 *   { files?: boolean, calendar?: boolean, escalation?: boolean }
 */

import OpenAI from "openai";
import { google } from "googleapis";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export interface CampaignToolConfig {
  files?: boolean;
  calendar?: boolean;
  escalation?: boolean;
}

export interface CampaignFile {
  id: string;
  name: string;
  url: string;
  description?: string;
  type: "image" | "video" | "document";
}

export interface GraphTurnResult {
  reply: string | null;
  handoff: boolean;
  handoffReason?: string;
  filesToSend: Array<{ url: string; type: "image" | "video" | "document"; caption?: string }>;
}

// ─── Graph state ─────────────────────────────────────────────────────────────

interface GraphState {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  filesToSend: Array<{ url: string; type: string; caption?: string }>;
  handoff: boolean;
  handoffReason: string;
  done: boolean;
}

// ─── Tool registry ────────────────────────────────────────────────────────────

function buildToolDefinitions(
  enabledTools: CampaignToolConfig,
  campaignFiles: CampaignFile[] | undefined,
  calendarId: string | undefined
): OpenAI.Chat.ChatCompletionTool[] {
  const tools: OpenAI.Chat.ChatCompletionTool[] = [];

  if (enabledTools.files && campaignFiles?.length) {
    tools.push({
      type: "function",
      function: {
        name: "listar_arquivos",
        description: "Lista os arquivos disponíveis para envio ao usuário.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    });
    tools.push({
      type: "function",
      function: {
        name: "enviar_arquivo",
        description:
          "Envia um arquivo ao usuário. Chame listar_arquivos antes para obter os IDs.",
        parameters: {
          type: "object",
          properties: {
            arquivo_id: { type: "string", description: "ID do arquivo" },
            legenda: { type: "string", description: "Legenda/caption opcional" },
          },
          required: ["arquivo_id"],
        },
      },
    });
  }

  if (enabledTools.calendar && calendarId) {
    tools.push({
      type: "function",
      function: {
        name: "verificar_disponibilidade",
        description:
          "Verifica janelas de horário disponíveis no Google Calendar.",
        parameters: {
          type: "object",
          properties: {
            data_inicio: { type: "string", description: "Data início YYYY-MM-DD" },
            data_fim: { type: "string", description: "Data fim YYYY-MM-DD" },
          },
          required: ["data_inicio", "data_fim"],
        },
      },
    });
    tools.push({
      type: "function",
      function: {
        name: "criar_agendamento",
        description: "Cria um agendamento no Google Calendar.",
        parameters: {
          type: "object",
          properties: {
            titulo: { type: "string" },
            data_inicio: { type: "string", description: "ISO 8601 (ex: 2024-03-15T14:00:00)" },
            data_fim: { type: "string", description: "ISO 8601" },
            descricao: { type: "string" },
            nome_cliente: { type: "string" },
            email_cliente: { type: "string" },
          },
          required: ["titulo", "data_inicio", "data_fim"],
        },
      },
    });
    tools.push({
      type: "function",
      function: {
        name: "cancelar_agendamento",
        description: "Cancela um agendamento existente pelo ID do evento.",
        parameters: {
          type: "object",
          properties: {
            evento_id: { type: "string", description: "ID do evento Google Calendar" },
            motivo: { type: "string" },
          },
          required: ["evento_id"],
        },
      },
    });
  }

  if (enabledTools.escalation) {
    tools.push({
      type: "function",
      function: {
        name: "escalar_humano",
        description:
          "Transfere o atendimento para um corretor humano quando o cliente pedir ou quando estiver pronto para ser atendido.",
        parameters: {
          type: "object",
          properties: {
            motivo: { type: "string", description: "Motivo da transferência" },
          },
          required: ["motivo"],
        },
      },
    });
  }

  return tools;
}

// ─── Tool executor (tools_node) ───────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, any>,
  campaignFiles: CampaignFile[] | undefined,
  calendarId: string | undefined,
  state: GraphState
): Promise<string> {
  switch (name) {
    case "listar_arquivos": {
      if (!campaignFiles?.length) return "Nenhum arquivo disponível.";
      return JSON.stringify(
        campaignFiles.map((f) => ({
          id: f.id,
          nome: f.name,
          descricao: f.description ?? "",
          tipo: f.type,
        }))
      );
    }

    case "enviar_arquivo": {
      const file = campaignFiles?.find((f) => f.id === args.arquivo_id);
      if (!file) return `Arquivo com ID "${args.arquivo_id}" não encontrado.`;
      state.filesToSend.push({ url: file.url, type: file.type, caption: args.legenda });
      return `Arquivo "${file.name}" programado para envio.`;
    }

    case "verificar_disponibilidade": {
      try {
        const auth = new google.auth.GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        });
        const calendar = google.calendar({
          version: "v3",
          auth: (await auth.getClient()) as any,
        });
        const res = await calendar.freebusy.query({
          requestBody: {
            timeMin: new Date(args.data_inicio + "T00:00:00").toISOString(),
            timeMax: new Date(args.data_fim + "T23:59:59").toISOString(),
            items: [{ id: calendarId! }],
          },
        });
        const busy = res.data.calendars?.[calendarId!]?.busy ?? [];
        if (busy.length === 0) return "Nenhum horário ocupado no período informado.";
        return (
          "Horários ocupados:\n" +
          busy
            .map(
              (b) =>
                `- ${new Date(b.start!).toLocaleString("pt-BR")} até ${new Date(b.end!).toLocaleString("pt-BR")}`
            )
            .join("\n")
        );
      } catch (err: any) {
        logger.warn({ err }, "Calendar freebusy error");
        return "Não foi possível verificar a disponibilidade no momento.";
      }
    }

    case "criar_agendamento": {
      try {
        const auth = new google.auth.GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/calendar"],
        });
        const calendar = google.calendar({
          version: "v3",
          auth: (await auth.getClient()) as any,
        });
        const attendees = args.email_cliente
          ? [{ email: args.email_cliente, displayName: args.nome_cliente }]
          : [];
        const event = await calendar.events.insert({
          calendarId: calendarId!,
          requestBody: {
            summary: args.titulo,
            description: args.descricao,
            start: { dateTime: args.data_inicio },
            end: { dateTime: args.data_fim },
            attendees,
          },
        });
        return `Agendamento criado com sucesso! Link: ${event.data.htmlLink ?? "(sem link)"}`;
      } catch (err: any) {
        logger.warn({ err }, "Calendar create event error");
        return "Não foi possível criar o agendamento no momento.";
      }
    }

    case "cancelar_agendamento": {
      try {
        const auth = new google.auth.GoogleAuth({
          scopes: ["https://www.googleapis.com/auth/calendar"],
        });
        const calendar = google.calendar({
          version: "v3",
          auth: (await auth.getClient()) as any,
        });
        await calendar.events.delete({
          calendarId: calendarId!,
          eventId: args.evento_id,
        });
        return "Agendamento cancelado com sucesso.";
      } catch (err: any) {
        logger.warn({ err }, "Calendar delete event error");
        return "Não foi possível cancelar o agendamento.";
      }
    }

    case "escalar_humano": {
      state.handoff = true;
      state.handoffReason = args.motivo ?? "solicitação do cliente";
      state.done = true;
      return "Atendimento transferido para um de nossos corretores. Em breve entraremos em contato!";
    }

    default:
      return `Ferramenta "${name}" não reconhecida.`;
  }
}

// ─── Agent node (LLM call) ────────────────────────────────────────────────────

async function agentNode(
  state: GraphState,
  client: OpenAI,
  model: string,
  systemPrompt: string,
  tools: OpenAI.Chat.ChatCompletionTool[]
): Promise<void> {
  const response = await client.chat.completions.create({
    model,
    temperature: 0.6,
    messages: [
      { role: "system", content: systemPrompt },
      ...state.messages,
    ],
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
  });

  const choice = response.choices[0];
  const msg = choice.message;
  state.messages.push(msg as OpenAI.Chat.ChatCompletionMessageParam);

  if (choice.finish_reason === "stop" || !msg.tool_calls?.length) {
    state.done = true;
  }
}

// ─── Tools node ───────────────────────────────────────────────────────────────

async function toolsNode(
  state: GraphState,
  campaignFiles: CampaignFile[] | undefined,
  calendarId: string | undefined
): Promise<void> {
  const lastMsg = state.messages.at(-1) as any;
  if (!lastMsg?.tool_calls?.length) return;

  for (const toolCall of lastMsg.tool_calls) {
    let args: Record<string, any> = {};
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch {}

    const result = await executeTool(
      toolCall.function.name,
      args,
      campaignFiles,
      calendarId,
      state
    );

    state.messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: result,
    });

    if (state.done) break; // escalate_human sets done=true
  }
}

// ─── Graph runner ─────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 8;

const REPLY_SYSTEM_SUFFIX = `

## COMPORTAMENTO GERAL (SDR HUMANIZADO)
- Sempre seja amigável, persuasivo e escreva como um humano natural no WhatsApp.
- Não envie blocos de texto gigantescos de uma vez. Divida suas ideias usando quebras de linha duplas (\\n\\n) para simular o comportamento de uma pessoa enviando múltiplas mensagens curtas em sequência.
- Remova pontos finais rígidos ao final de mensagens isoladas para parecer mais orgânico e coloquial.
- Faça as perguntas de qualificação UMA POR VEZ, de forma muito fluida e orgânica, sempre encadeando com o contexto atual da conversa.
- Mantenha itens de lista e benefícios juntos, NUNCA quebre listas ao meio.
- Responda sempre no idioma que o lead está usando.`;

/**
 * Run one conversation turn using the LangGraph-style ReAct graph.
 * When no tools are enabled, falls back to a single chat completion.
 */
export async function runGraphTurn(params: {
  leadId: string;
  systemPrompt: string;
  inboundText: string;
  enabledTools?: CampaignToolConfig;
  campaignFiles?: CampaignFile[];
  calendarId?: string;
}): Promise<GraphTurnResult> {
  const {
    leadId,
    systemPrompt,
    inboundText,
    enabledTools = {},
    campaignFiles,
    calendarId,
  } = params;

  // ── Get OpenAI credentials ────────────────────────────────────────────────
  const [keySetting, modelSetting] = await Promise.all([
    prisma.setting.findUnique({ where: { key: "openai_api_key" } }),
    prisma.setting.findUnique({ where: { key: "llm_model" } }),
  ]);
  const apiKey = keySetting?.value || process.env.OPENAI_API_KEY || "";
  const model = modelSetting?.value || process.env.LLM_MODEL || "gpt-4o-mini";
  if (!apiKey || apiKey.startsWith("sk-...")) {
    throw new Error("OpenAI API Key não configurada.");
  }
  const client = new OpenAI({ apiKey });

  // ── Fetch history and seed initial state ─────────────────────────────────
  const history = await prisma.message.findMany({
    where: { leadId },
    orderBy: { timestamp: "desc" },
    take: 20,
  });
  history.reverse();

  const historyMsgs: OpenAI.Chat.ChatCompletionMessageParam[] = history.map(
    (m) =>
      m.direction === "inbound"
        ? { role: "user" as const, content: m.content }
        : { role: "assistant" as const, content: m.content }
  );

  const lastMsg = historyMsgs.at(-1);
  if (!lastMsg || lastMsg.role !== "user" || lastMsg.content !== inboundText) {
    historyMsgs.push({ role: "user", content: inboundText });
  }

  const state: GraphState = {
    messages: historyMsgs,
    filesToSend: [],
    handoff: false,
    handoffReason: "",
    done: false,
  };

  const tools = buildToolDefinitions(enabledTools, campaignFiles, calendarId);
  const fullSystemPrompt = systemPrompt + REPLY_SYSTEM_SUFFIX;

  // ── ReAct loop ────────────────────────────────────────────────────────────
  for (let i = 0; i < MAX_ITERATIONS && !state.done; i++) {
    await agentNode(state, client, model, fullSystemPrompt, tools);
    if (!state.done) {
      await toolsNode(state, campaignFiles, calendarId);
    }
  }

  // ── Extract final text reply ──────────────────────────────────────────────
  let reply: string | null = null;
  if (!state.handoff) {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i] as any;
      if (m.role === "assistant" && typeof m.content === "string" && m.content.trim()) {
        reply = m.content.trim();
        break;
      }
    }
  }

  return {
    reply,
    handoff: state.handoff,
    handoffReason: state.handoff ? state.handoffReason : undefined,
    filesToSend: state.filesToSend as GraphTurnResult["filesToSend"],
  };
}
