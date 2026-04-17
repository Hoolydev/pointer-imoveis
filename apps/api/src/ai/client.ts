import OpenAI from "openai";
import { prisma } from "../lib/prisma";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "high" | "low" } };

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface LLMClient {
  chat(messages: ChatMsg[], opts?: { temperature?: number; json?: boolean }): Promise<string>;
  transcribeAudio(url: string): Promise<string>;
}

class OpenAIClient implements LLMClient {
  private async getConfig() {
    const [keySetting, modelSetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "openai_api_key" } }),
      prisma.setting.findUnique({ where: { key: "llm_model" } }),
    ]);
    const apiKey = keySetting?.value || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey.startsWith("sk-...")) {
      throw new Error("OpenAI API Key is missing. Configure it in settings or .env");
    }
    const model = modelSetting?.value || process.env.LLM_MODEL || "gpt-4o-mini";
    return { client: new OpenAI({ apiKey }), model };
  }

  async chat(messages: ChatMsg[], opts: { temperature?: number; json?: boolean } = {}): Promise<string> {
    const { client, model } = await this.getConfig();
    const res = await client.chat.completions.create({
      model,
      temperature: opts.temperature ?? 0.7,
      response_format: opts.json ? { type: "json_object" } : undefined,
      messages: messages as any,
    });
    return res.choices[0]?.message?.content ?? "";
  }

  async transcribeAudio(url: string): Promise<string> {
    const { client } = await this.getConfig();
    const audioResp = await fetch(url);
    if (!audioResp.ok) throw new Error(`Failed to fetch audio: ${audioResp.status}`);
    const buffer = await audioResp.arrayBuffer();
    const file = new File([buffer], "audio.ogg", { type: "audio/ogg" });
    const transcription = await client.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "pt",
    });
    return transcription.text;
  }
}

let singleton: LLMClient | null = null;
export function getLLM(): LLMClient {
  if (!singleton) singleton = new OpenAIClient();
  return singleton;
}

export function setLLM(client: LLMClient) {
  singleton = client;
}
