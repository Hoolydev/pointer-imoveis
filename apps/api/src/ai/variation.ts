import { z } from "zod";
import { getLLM } from "./client";
import { logger } from "../lib/logger";

const schema = z.object({ variations: z.array(z.string().min(1)).min(1) });

const SYSTEM = `You generate micro-variations of a WhatsApp outreach message.

HARD RULES:
- Same meaning, same intention.
- Same call-to-action.
- Do NOT change the offer.
- Do NOT change the tone (keep it equally formal/casual).
- Only swap greetings, connectors, word order, light synonyms.
- Each variation must feel human and natural, never robotic.
- Each variation must differ from the others.
- Output between 15 and 25 variations.

Return ONLY a JSON object: {"variations": ["...", "..."]}`;

export async function generateVariations(baseMessage: string): Promise<string[]> {
  const llm = getLLM();
  const raw = await llm.chat(
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Base message:\n${baseMessage}` },
    ],
    { temperature: 0.9, json: true }
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.error({ raw }, "variation: invalid JSON");
    return [baseMessage];
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    logger.error({ issues: result.error.issues }, "variation: schema mismatch");
    return [baseMessage];
  }

  // Always include the original, dedupe, cap at 25.
  const set = new Set<string>([baseMessage.trim(), ...result.data.variations.map((s) => s.trim())]);
  const out = Array.from(set).filter(Boolean).slice(0, 25);
  return out.length >= 1 ? out : [baseMessage];
}

/**
 * Round-robin pick: distribute variations evenly across an ordered list of leads.
 * NOT random — guarantees balanced spread.
 */
export function pickVariationIndex(positionInList: number, total: number): number {
  if (total <= 0) return 0;
  return positionInList % total;
}
