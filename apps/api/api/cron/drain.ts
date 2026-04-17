import type { Request, Response } from "express";
import { Worker } from "bullmq";
import { redis } from "../../src/lib/redis";
import { logger } from "../../src/lib/logger";
import { CAMPAIGN_QUEUE, INBOUND_QUEUE } from "../../src/queues/index";
import { campaignProcessor } from "../../src/queues/processors";
import { inboundProcessor } from "../../src/queues/processors";
import { autoCobrarStagnantBrokers } from "../../src/services/broker.service";

const BUDGET_MS = 50_000;   // leave 10s buffer before Vercel's 60s limit
const MAX_JOBS = 60;        // safety cap per invocation

/**
 * Vercel cron endpoint — runs every 1 minute.
 * Drains pending jobs from both queues within the function's time budget.
 *
 * Authorization: header x-cron-secret must match CRON_SECRET env var.
 *
 * Self-chain: if more jobs remain and time budget allows, fires itself again.
 */
export default async function handler(req: Request, res: Response) {
  if (req.method === "GET") {
    // Vercel cron sends GET; real invocations can also be POST for testing
  }
  const secret = process.env.CRON_SECRET;
  const provided = req.headers["x-cron-secret"] ?? req.headers.authorization?.replace("Bearer ", "");
  if (secret && provided !== secret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const start = Date.now();
  let processed = 0;

  const campaignWorker = new Worker(CAMPAIGN_QUEUE, campaignProcessor, {
    connection: redis,
    concurrency: 5,
    autorun: false,
  });
  const inboundWorker = new Worker(INBOUND_QUEUE, inboundProcessor, {
    connection: redis,
    concurrency: 5,
    autorun: false,
  });

  async function drainQueue(worker: Worker, maxJobs: number): Promise<number> {
    let count = 0;
    while (count < maxJobs && Date.now() - start < BUDGET_MS) {
      const job = await worker.getNextJob("drain-token");
      if (!job) break;
      try {
        const processor = worker.name === CAMPAIGN_QUEUE ? campaignProcessor : inboundProcessor;
        await processor(job as any);
        await job.moveToCompleted("ok", "drain-token", false);
      } catch (err: any) {
        logger.error({ err, jobId: job.id }, "drain job failed");
        await job.moveToFailed(err, "drain-token", false);
      }
      count++;
    }
    return count;
  }

  try {
    const inboundCount = await drainQueue(inboundWorker, MAX_JOBS);
    const campaignCount = await drainQueue(campaignWorker, MAX_JOBS - inboundCount);
    processed = inboundCount + campaignCount;
    logger.info({ processed, elapsedMs: Date.now() - start }, "drain complete");
  } finally {
    await Promise.allSettled([campaignWorker.close(), inboundWorker.close()]);
  }

  // Stagnation check: alert brokers with handoff leads inactive > 3 days (runs at most every 6h)
  autoCobrarStagnantBrokers().catch((err) => logger.error({ err }, "stagnation check failed"));

  // Self-chain if we hit the job cap (may be more pending)
  if (processed >= MAX_JOBS) {
    const baseUrl = process.env.PUBLIC_BASE_URL ?? "";
    if (baseUrl) {
      fetch(`${baseUrl}/api/cron/drain`, {
        method: "GET",
        headers: { "x-cron-secret": secret ?? "" },
      }).catch(() => {/* fire-and-forget */});
    }
  }

  return res.json({ ok: true, processed, elapsedMs: Date.now() - start });
}
