import { logger } from "../lib/logger";
import { normalizePhone } from "../lib/csv";
import { prisma } from "../lib/prisma";
import type { InboundMessage, MediaType, ProviderConfig, SendResult, WhatsAppProvider } from "./types";

export class OfficialWhatsAppProvider implements WhatsAppProvider {
  readonly name = "official";

  constructor(private config?: ProviderConfig) {}

  async sendMessage(to: string, message: string): Promise<SendResult> {
    let token = this.config?.token;
    let phoneId = this.config?.phoneId;

    if (!token || !phoneId) {
      const [tokenSetting, phoneIdSetting] = await Promise.all([
        prisma.setting.findUnique({ where: { key: "wa_official_token" } }),
        prisma.setting.findUnique({ where: { key: "wa_official_phone_id" } }),
      ]);
      token = token || tokenSetting?.value || process.env.WHATSAPP_OFFICIAL_TOKEN || "";
      phoneId = phoneId || phoneIdSetting?.value || process.env.WHATSAPP_OFFICIAL_PHONE_ID || "";
    }

    if (!token || !phoneId) {
      throw new Error("WHATSAPP_OFFICIAL_TOKEN / PHONE_ID missing in campaign config, settings or env");
    }
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`official send failed ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as any;
    return { id: data?.messages?.[0]?.id ?? `wa_${Date.now()}` };
  }

  async sendMedia(to: string, url: string, mediaType: MediaType, caption?: string): Promise<SendResult> {
    let token = this.config?.token;
    let phoneId = this.config?.phoneId;

    if (!token || !phoneId) {
      const [tokenSetting, phoneIdSetting] = await Promise.all([
        prisma.setting.findUnique({ where: { key: "wa_official_token" } }),
        prisma.setting.findUnique({ where: { key: "wa_official_phone_id" } }),
      ]);
      token = token || tokenSetting?.value || process.env.WHATSAPP_OFFICIAL_TOKEN || "";
      phoneId = phoneId || phoneIdSetting?.value || process.env.WHATSAPP_OFFICIAL_PHONE_ID || "";
    }

    if (!token || !phoneId) {
      throw new Error("WHATSAPP_OFFICIAL_TOKEN / PHONE_ID missing in campaign config, settings or env");
    }

    const mediaPayload: Record<string, unknown> = { link: url };
    if (caption) mediaPayload.caption = caption;
    if (mediaType === "document") mediaPayload.filename = url.split("/").pop() ?? "media";

    const apiUrl = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: mediaType,
        [mediaType]: mediaPayload,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`official sendMedia failed ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as any;
    return { id: data?.messages?.[0]?.id ?? `wa_${Date.now()}` };
  }

  parseInboundWebhook(payload: unknown): InboundMessage | null {
    try {
      const p = payload as any;
      const change = p?.entry?.[0]?.changes?.[0]?.value;
      const msg = change?.messages?.[0];
      if (!msg) return null;
      const phone = normalizePhone(String(msg.from));
      if (!phone) return null;

      let text = "";
      let mediaUrl: string | undefined;
      let mediaType: InboundMessage["mediaType"];
      let mediaFileName: string | undefined;

      switch (msg.type) {
        case "text":
          text = String(msg.text?.body ?? "");
          break;
        case "image":
          mediaType = "image";
          mediaUrl = msg.image?.link ?? undefined;
          text = msg.image?.caption ?? "";
          break;
        case "audio":
          mediaType = "audio";
          mediaUrl = msg.audio?.link ?? undefined;
          break;
        case "video":
          mediaType = "video";
          mediaUrl = msg.video?.link ?? undefined;
          text = msg.video?.caption ?? "";
          break;
        case "document":
          mediaType = "document";
          mediaUrl = msg.document?.link ?? undefined;
          mediaFileName = msg.document?.filename;
          text = msg.document?.caption ?? "";
          break;
        default:
          return null;
      }

      if (!text && !mediaUrl) return null;

      return {
        from: phone,
        text,
        messageId: String(msg.id),
        providerName: this.name,
        mediaUrl,
        mediaType,
        mediaFileName,
      };
    } catch (err) {
      logger.warn({ err }, "official webhook parse failed");
      return null;
    }
  }
}
