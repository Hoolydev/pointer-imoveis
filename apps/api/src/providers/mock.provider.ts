import { logger } from "../lib/logger";
import type { InboundMessage, MediaType, SendResult, WhatsAppProvider } from "./types";

/** No-op provider for local dev / tests — logs instead of sending. */
export class MockProvider implements WhatsAppProvider {
  readonly name = "mock";

  async sendMessage(to: string, message: string): Promise<SendResult> {
    logger.info({ to, message }, "[mock] sendMessage");
    return { id: `mock_${Date.now()}` };
  }

  async sendMedia(to: string, url: string, mediaType: MediaType, caption?: string): Promise<SendResult> {
    logger.info({ to, url, mediaType, caption }, "[mock] sendMedia");
    return { id: `mock_media_${Date.now()}` };
  }

  parseInboundWebhook(payload: unknown): InboundMessage | null {
    const p = payload as any;
    if (!p?.from || !p?.text) return null;
    return {
      from: String(p.from).replace(/\D+/g, ""),
      text: String(p.text),
      messageId: String(p.id ?? `mock_in_${Date.now()}`),
      providerName: this.name,
    };
  }
}
