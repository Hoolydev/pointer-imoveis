import express, { type Request, type Response, type NextFunction } from "express";
import path from "path";
import fs from "fs";
import { ZodError } from "zod";
import { logger } from "./lib/logger";
import campaignsRouter from "./routes/campaigns";
import leadsRouter from "./routes/leads";
import webhooksRouter from "./routes/webhooks";
import statsRouter from "./routes/stats";
import brokersRouter from "./routes/brokers";
import settingsRouter from "./routes/settings";
import cronDrainHandler from "../api/cron/drain";

export function buildApp() {
  const app = express();

  // CORS — allow Next.js dev frontend and any configured origin
  app.use((req, res, next) => {
    const origin = req.headers.origin ?? "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  app.use(express.json({ limit: "2mb" }));
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, url: req.url }, "request");
    next();
  });

  // Health
  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Cron drain (also accessible for local testing)
  app.get("/api/cron/drain", cronDrainHandler);
  app.post("/api/cron/drain", cronDrainHandler);

  // API routes
  app.use("/campaigns", campaignsRouter);
  app.use("/leads", leadsRouter);
  app.use("/webhooks", webhooksRouter);
  app.use("/stats", statsRouter);
  app.use("/brokers", brokersRouter);
  app.use("/settings", settingsRouter);

  // Not found
  app.use((_req, res) => res.status(404).json({ error: "not found" }));

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "validation", issues: err.issues });
    }
    if (err instanceof Error && err.message.includes("No")) {
      // Prisma "No X found" → 404
      return res.status(404).json({ error: err.message });
    }
    logger.error({ err }, "unhandled error");
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
