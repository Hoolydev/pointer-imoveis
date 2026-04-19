import { logger } from "../lib/logger";
import { normalizePhone } from "../lib/csv";
import { prisma } from "../lib/prisma";
import type { InboundMessage, MediaType, ProviderConfig, SendResult, WhatsAppProvider } from "./types";

export class UazapiProvider implements WhatsAppProvider {
  readonly name = "uazapi";

  constructor(private config?: ProviderConfig) {}

  async sendMessage(to: string, message: string): Promise<SendResult> {
    let baseUrl = this.config?.baseUrl;
    let token = this.config?.token;

    if (!baseUrl || !token) {
      const [urlSetting, tokenSetting] = await Promise.all([
        prisma.setting.findUnique({ where: { key: "uazapi_base_url" } }),
        prisma.setting.findUnique({ where: { key: "uazapi_token" } }),
      ]);
      baseUrl = baseUrl || urlSetting?.value || process.env.UAZAPI_BASE_URL || "https://free.uazapi.com";
      token = token || tokenSetting?.value || process.env.UAZAPI_TOKEN || "";
    }

    if (!token) throw new Error("UAZAPI_TOKEN missing in campaign config, settings or env");

    const url = `${baseUrl.replace(/\/$/, "")}/send/text`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: to, text: message }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`uazapi send failed ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as any;
    return { id: data?.messageid ?? data?.id ?? `uaz_${Date.now()}` };
  }

  async sendMedia(to: string, url: string, mediaType: MediaType, caption?: string): Promise<SendResult> {
    let baseUrl = this.config?.baseUrl;
    let token = this.config?.token;

    if (!baseUrl || !token) {
      const [urlSetting, tokenSetting] = await Promise.all([
        prisma.setting.findUnique({ where: { key: "uazapi_base_url" } }),
        prisma.setting.findUnique({ where: { key: "uazapi_token" } }),
      ]);
      baseUrl = baseUrl || urlSetting?.value || process.env.UAZAPI_BASE_URL || "https://free.uazapi.com";
      token = token || tokenSetting?.value || process.env.UAZAPI_TOKEN || "";
    }

    if (!token) throw new Error("UAZAPI_TOKEN missing in campaign config, settings or env");

    const endpointMap: Record<MediaType, string> = {
      image: "/send/image",
      video: "/send/video",
      document: "/send/document",
    };
    const bodyKeyMap: Record<MediaType, string> = {
      image: "image",
      video: "video",
      document: "document",
    };

    const endpoint = `${baseUrl.replace(/\/$/, "")}${endpointMap[mediaType]}`;
    const body: Record<string, unknown> = {
      number: to,
      [bodyKeyMap[mediaType]]: url,
    };
    if (caption) body.caption = caption;
    if (mediaType === "document") body.fileName = url.split("/").pop() ?? "media";

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`uazapi sendMedia failed ${res.status}: ${bodyText.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as any;
    return { id: data?.messageid ?? data?.id ?? `uaz_${Date.now()}` };
  }

  async sendTyping(to: string): Promise<void> {
    let baseUrl = this.config?.baseUrl;
    let token = this.config?.token;

    if (!baseUrl || !token) {
      const [urlSetting, tokenSetting] = await Promise.all([
        prisma.setting.findUnique({ where: { key: "uazapi_base_url" } }),
        prisma.setting.findUnique({ where: { key: "uazapi_token" } }),
      ]);
      baseUrl = baseUrl || urlSetting?.value || process.env.UAZAPI_BASE_URL || "https://free.uazapi.com";
      token = token || tokenSetting?.value || process.env.UAZAPI_TOKEN || "";
    }

    if (!token) return; // silently skip if not configured

    const url = `${baseUrl.replace(/\/$/, "")}/send/presence`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: to, presence: "composing" }),
    }).catch(() => {}); // fire-and-forget, non-critical
  }

  parseInboundWebhook(payload: unknown): InboundMessage | null {
    try {
      const p = payload as any;
      if (p?.message?.fromMe === true) return null;
      const sender = p?.message?.sender ?? p?.message?.from ?? p?.sender ?? p?.from;
      const id = p?.message?.id ?? p?.id ?? `uaz_in_${Date.now()}`;
      if (!sender) return null;
      const phone = normalizePhone(String(sender));
      if (!phone) return null;

      const msg = p?.message ?? p;
      const msgType: string = msg?.type ?? msg?.messageType ?? "";

      // Text messages
      const text: string = msg?.text ?? msg?.body ?? msg?.conversation ?? msg?.extendedTextMessage?.text ?? "";

      // Media extraction
      let mediaUrl: string | undefined;
      let mediaType: InboundMessage["mediaType"];
      let mediaFileName: string | undefined;

      if (msgType.startsWith("image") || msg?.imageMessage) {
        mediaUrl = msg?.imageMessage?.url ?? msg?.mediaUrl;
        mediaType = "image";
      } else if (msgType.startsWith("audio") || msgType === "pttMessage" || msg?.audioMessage || msg?.pttMessage) {
        mediaUrl = msg?.audioMessage?.url ?? msg?.pttMessage?.url ?? msg?.mediaUrl;
        mediaType = "audio";
      } else if (msgType.startsWith("video") || msg?.videoMessage) {
        mediaUrl = msg?.videoMessage?.url ?? msg?.mediaUrl;
        mediaType = "video";
      } else if (msgType.startsWith("document") || msg?.documentMessage) {
        mediaUrl = msg?.documentMessage?.url ?? msg?.mediaUrl;
        mediaType = "document";
        mediaFileName = msg?.documentMessage?.fileName ?? msg?.fileName;
      }

      const caption = msg?.imageMessage?.caption ?? msg?.videoMessage?.caption ?? msg?.documentMessage?.caption ?? "";

      // Must have either text or media
      if (!text && !mediaUrl) return null;

      return {
        from: phone,
        text: text || caption || "",
        messageId: String(id),
        providerName: this.name,
        mediaUrl,
        mediaType,
        mediaFileName,
      };
    } catch (err) {
      logger.warn({ err }, "uazapi webhook parse failed");
      return null;
    }
  }
}
