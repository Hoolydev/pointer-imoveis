import "dotenv/config";
import { buildApp } from "./app";
import { logger } from "./lib/logger";

const PORT = Number(process.env.PORT ?? 3001);
const app = buildApp();

app.listen(PORT, () => {
  logger.info({ port: PORT }, "API server started");

  if (!process.env.VERCEL) {
    logger.info("Non-Vercel mode: starting background auto-drain interval (10s)");
    setInterval(() => {
      fetch(`http://localhost:${PORT}/api/cron/drain`, {
        headers: { "x-cron-secret": process.env.CRON_SECRET || "" }
      }).catch(() => {});
    }, 10000);
  }
});
