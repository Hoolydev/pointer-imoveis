/**
 * Message humanizer — port of n8n Secretária v3 "Quebrar e enviar mensagens" (workflow 07).
 *
 * Turns a single AI response into multiple natural chunks, as if a person
 * were typing them one by one.  Also calculates realistic per-chunk typing
 * delays (150 WPM, capped at 15 s) and exposes the logic for providers to
 * send a WhatsApp typing indicator before each chunk.
 */

import { getLLM } from "./client";
import { logger } from "../lib/logger";

// ─── Typing speed ─────────────────────────────────────────────────────────────

const WORDS_PER_MINUTE = 150;
const AVG_WORD_CHARS_PT = 4.5;   // average Portuguese word length
const MAX_DELAY_MS = 15_000;     // cap at 15 s (Secretária v3 uses 25 s; we shorten for responsiveness)
const MIN_DELAY_MS = 600;        // never send instantly

/**
 * How long to simulate typing for a given chunk.
 * Formula: chars / (4.5 chars/word) / (150 words/min) × 60 s → ms
 */
export function typingDelayMs(text: string): number {
  const words = text.length / AVG_WORD_CHARS_PT;
  const seconds = (words / WORDS_PER_MINUTE) * 60;
  return Math.max(MIN_DELAY_MS, Math.min(Math.round(seconds * 1000), MAX_DELAY_MS));
}

// ─── AI message splitter ──────────────────────────────────────────────────────

const SPLIT_SYSTEM = `## PAPEL

Você é um agente que simula o comportamento humano ao enviar mensagens em um aplicativo de mensagens como o WhatsApp. Seu objetivo é pegar uma mensagem recebida como entrada e dividi-la em múltiplas mensagens menores — sem alterar nenhuma palavra do conteúdo original — apenas separando em partes naturais, como um humano faria ao digitar e enviar aos poucos.

## OBJETIVO

Transformar uma única mensagem em um JSON com o campo "mensagens" que é um array de strings, simulando o envio humano em blocos de texto menores.

## REGRAS OBRIGATÓRIAS

- Não reescreva nem altere o conteúdo. Apenas separe em mensagens menores respeitando a pontuação e pausas naturais.
- As divisões devem parecer naturais — pense como uma pessoa que está digitando e envia aos poucos.
- Evite cortar frases no meio sem necessidade.
- Sempre retorne como um array de strings com a mesma ordem do texto original.
- Remova vírgulas e pontos nos finais das mensagens, quando necessário.
- Tente manter cada mensagem entre 1 a 4 frases no máximo.
- **NUNCA QUEBRE A MENSAGEM EM MAIS DE 5 PARTES**
- **NUNCA QUEBRE LISTAS EM MÚLTIPLAS MENSAGENS** — mantenha itens de lista juntos na mesma mensagem.
- Se a mensagem já for curta (uma única frase), retorne-a como único elemento do array.

## FORMATO DE RESPOSTA

Responda APENAS com JSON válido:
{"mensagens": ["parte 1", "parte 2", ...]}`;

/**
 * Split one AI reply into natural WhatsApp-style chunks using an LLM.
 *
 * Short messages (< 180 chars with no paragraph breaks) are returned as-is
 * to avoid an extra LLM round-trip.
 */
export async function splitIntoChunks(message: string): Promise<string[]> {
  const trimmed = message.trim();
  if (!trimmed) return [];

  // Heuristic: if short and no explicit breaks, no need to split
  if (trimmed.length < 180 && !/\n{2,}/.test(trimmed)) {
    return [trimmed];
  }

  try {
    const llm = getLLM();
    const raw = await llm.chat(
      [
        { role: "system", content: SPLIT_SYSTEM },
        { role: "user", content: trimmed },
      ],
      { temperature: 0.1, json: true }
    );
    const parsed = JSON.parse(raw) as { mensagens?: string[] };
    if (Array.isArray(parsed.mensagens) && parsed.mensagens.length > 0) {
      return parsed.mensagens.map((s) => String(s).trim()).filter(Boolean);
    }
  } catch (err) {
    logger.warn({ err }, "humanize: LLM split failed, falling back to paragraph split");
  }

  // Fallback: split by paragraph breaks
  const chunks = trimmed
    .replace(/\\n\\n/g, "\n\n")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return chunks.length ? chunks : [trimmed];
}

// ─── Full humanized send ──────────────────────────────────────────────────────

export interface SendChunkFn {
  (chunk: string): Promise<void>;
}

export interface TypingFn {
  (): Promise<void>;
}

/**
 * Humanized send:
 * 1. Splits the message with the AI splitter
 * 2. For each chunk:
 *    a. Sends typing indicator (if available)
 *    b. Waits the typing delay (proportional to chunk length)
 *    c. Calls sendChunk
 *    d. Waits 1 s before the next chunk
 *
 * @param message    Full AI reply text
 * @param sendChunk  Callback that actually sends the WhatsApp message
 * @param sendTyping Optional callback that triggers the "typing..." indicator
 */
export async function humanizedSend(
  message: string,
  sendChunk: SendChunkFn,
  sendTyping?: TypingFn
): Promise<void> {
  const chunks = await splitIntoChunks(message);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // Typing indicator + delay (simulates a person typing the chunk)
    if (sendTyping) {
      await sendTyping().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, typingDelayMs(chunk)));

    await sendChunk(chunk);

    // 1 s buffer between messages (like Secretária v3 "Espera enviar mensagem")
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
