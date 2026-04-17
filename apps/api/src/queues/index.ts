import { Queue, Worker, type Processor } from "bullmq";
import { redis } from "../lib/redis";

export interface CampaignJobData {
  leadId: string;
  campaignId: string;
  variationIndex: number;
  type?: "blast" | "followup";
  followUpIndex?: number;
}

export interface InboundJobData {
  leadId: string;
  inboundText: string;
  inboundMessageId: string;
  providerName: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  mediaFileName?: string;
}

export const CAMPAIGN_QUEUE = "campaign-send";
export const INBOUND_QUEUE = "inbound-reply";

export const campaignQueue = new Queue<CampaignJobData>(CAMPAIGN_QUEUE, { connection: redis });
export const inboundQueue = new Queue<InboundJobData>(INBOUND_QUEUE, { connection: redis });

/**
 * Build a Worker. In Vercel cron mode we DO NOT instantiate workers at boot —
 * the drain handler creates short-lived workers per invocation.
 */
export function createWorker<T>(name: string, processor: Processor<T>, opts: { rateMaxPerMin?: number } = {}) {
  return new Worker<T>(name, processor, {
    connection: redis,
    concurrency: 4,
    limiter: opts.rateMaxPerMin
      ? { max: opts.rateMaxPerMin, duration: 60_000 }
      : undefined,
    autorun: false, // we control via worker.run() in drain
  });
}
