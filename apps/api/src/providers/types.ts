export interface ProviderConfig {
  baseUrl?: string;
  token?: string;
  instance?: string;
  phoneId?: string;
}

export interface InboundMessage {
  from: string;       // normalized phone digits
  text: string;       // caption, transcript, or empty string
  messageId: string;
  providerName: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  mediaFileName?: string;
}

export interface SendResult {
  id: string;
}

export type MediaType = "image" | "video" | "document";

export interface WhatsAppProvider {
  readonly name: string;
  sendMessage(to: string, message: string): Promise<SendResult>;
  sendMedia?(to: string, url: string, mediaType: MediaType, caption?: string): Promise<SendResult>;
  /** Send a typing/composing presence update to simulate the bot "typing". Optional. */
  sendTyping?(to: string): Promise<void>;
  parseInboundWebhook(payload: unknown): InboundMessage | null;
}
