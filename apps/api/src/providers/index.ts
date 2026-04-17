import { MockProvider } from "./mock.provider";
import { OfficialWhatsAppProvider } from "./official.provider";
import { UazapiProvider } from "./uazapi.provider";
import type { ProviderConfig, WhatsAppProvider } from "./types";

const cache = new Map<string, WhatsAppProvider>();

export function getProvider(name?: string, config?: ProviderConfig): WhatsAppProvider {
  const key = (name ?? process.env.WHATSAPP_PROVIDER ?? "uazapi").toLowerCase();

  // When per-campaign config is provided, create a fresh uncached instance
  if (config && (config.token || config.baseUrl || config.phoneId)) {
    switch (key) {
      case "mock":     return new MockProvider();
      case "official": return new OfficialWhatsAppProvider(config);
      case "uazapi":
      default:         return new UazapiProvider(config);
    }
  }

  if (cache.has(key)) return cache.get(key)!;
  let p: WhatsAppProvider;
  switch (key) {
    case "mock":     p = new MockProvider(); break;
    case "official": p = new OfficialWhatsAppProvider(); break;
    case "uazapi":
    default:         p = new UazapiProvider(); break;
  }
  cache.set(key, p);
  return p;
}

export type { WhatsAppProvider, InboundMessage, SendResult, ProviderConfig } from "./types";
