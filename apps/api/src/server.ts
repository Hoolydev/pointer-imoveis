import "dotenv/config";
import { buildApp } from "./app";
import { logger } from "./lib/logger";
import { Worker } from "bullmq";
import { redis } from "./lib/redis";
import { CAMPAIGN_QUEUE, INBOUND_QUEUE } from "./queues";
import { campaignProcessor, inboundProcessor } from "./queues/processors";
import { autoCobrarStagnantBrokers } from "./services/broker.service";

const PORT = Number(process.env.PORT ?? 3001);
const app = buildApp();

app.listen(PORT, () => {
  logger.info({ port: PORT }, "API server started");

  if (!process.env.VERCEL) {
    if (process.env.REDIS_URL) {
      logger.info("Non-Vercel mode: starting persistent BullMQ workers");

      // Persistent workers running natively in Node event loop
      const campaignWorker = new Worker(CAMPAIGN_QUEUE, campaignProcessor, {
        connection: redis,
        concurrency: 5,
        autorun: true,
      });

      const inboundWorker = new Worker(INBOUND_QUEUE, inboundProcessor, {
        connection: redis,
        concurrency: 5,
        autorun: true,
      });

      campaignWorker.on("error", (err) => logger.error({ err }, "Campaign Worker error"));
      inboundWorker.on("error", (err) => logger.error({ err }, "Inbound Worker error"));
    } else {
      logger.warn("REDIS_URL not set - Non-Vercel persistent BullMQ workers will NOT start.");
    }

    // Stagnation cron: Run directly in Node background 

    // instead of via Vercel lambda invoke (runs every 6 hours)
    setInterval(() => {
      autoCobrarStagnantBrokers().catch((err) =>
        logger.error({ err }, "stagnation check failed")
      );
    }, 6 * 60 * 60 * 1000);
  }
});
