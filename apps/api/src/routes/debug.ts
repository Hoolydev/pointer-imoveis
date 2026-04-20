import { Router } from "express";
import { prisma } from "../lib/prisma";
import { campaignQueue, inboundQueue } from "../queues/index";

const router = Router();

// GET /debug — config health + queue stats + recent failures
router.get("/", async (_req, res, next) => {
  try {
    // Config checks
    const hauzChaveSetting = await prisma.setting.findUnique({ where: { key: "hauz_chave" } }).catch(() => null);
    const hauzChave = hauzChaveSetting?.value || process.env.HAUZ_CHAVE || null;

    const config = {
      openai_key: !!process.env.OPENAI_API_KEY,
      hauz_chave: hauzChave ? `${hauzChave.slice(0, 8)}…` : null,
      uazapi_token: !!(process.env.UAZAPI_TOKEN || process.env.WHATSAPP_TOKEN),
      uazapi_url: process.env.UAZAPI_BASE_URL || process.env.WHATSAPP_BASE_URL || null,
      public_base_url: process.env.PUBLIC_BASE_URL || null,
      redis_url: !!process.env.REDIS_URL,
      database_url: !!process.env.DATABASE_URL,
      provider: process.env.WHATSAPP_PROVIDER || "uazapi",
    };

    // Queue stats
    const [campaignCounts, inboundCounts] = await Promise.all([
      Promise.all([
        campaignQueue.getWaitingCount(),
        campaignQueue.getActiveCount(),
        campaignQueue.getFailedCount(),
        campaignQueue.getDelayedCount(),
        campaignQueue.getCompletedCount(),
      ]),
      Promise.all([
        inboundQueue.getWaitingCount(),
        inboundQueue.getActiveCount(),
        inboundQueue.getFailedCount(),
        inboundQueue.getDelayedCount(),
        inboundQueue.getCompletedCount(),
      ]),
    ]);

    const queues = {
      campaign_send: {
        waiting: campaignCounts[0],
        active: campaignCounts[1],
        failed: campaignCounts[2],
        delayed: campaignCounts[3],
        completed: campaignCounts[4],
      },
      inbound_reply: {
        waiting: inboundCounts[0],
        active: inboundCounts[1],
        failed: inboundCounts[2],
        delayed: inboundCounts[3],
        completed: inboundCounts[4],
      },
    };

    // Recent failed jobs (last 10 from each queue)
    const [campaignFailed, inboundFailed] = await Promise.all([
      campaignQueue.getFailed(0, 9),
      inboundQueue.getFailed(0, 9),
    ]);

    const failures = [
      ...campaignFailed.map((j) => ({
        queue: "campaign_send",
        jobId: j.id,
        name: j.name,
        data: j.data,
        error: j.failedReason,
        attempts: j.attemptsMade,
        timestamp: j.timestamp,
      })),
      ...inboundFailed.map((j) => ({
        queue: "inbound_reply",
        jobId: j.id,
        name: j.name,
        data: { leadId: (j.data as any).leadId, text: (j.data as any).inboundText?.slice(0, 80) },
        error: j.failedReason,
        attempts: j.attemptsMade,
        timestamp: j.timestamp,
      })),
    ].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0)).slice(0, 20);

    // DB sanity
    const [leadCount, campaignCount, runningCampaigns] = await Promise.all([
      prisma.lead.count(),
      prisma.campaign.count(),
      prisma.campaign.findMany({
        where: { status: "running" },
        select: { id: true, name: true, type: true, provider: true, systemPrompt: true },
      }),
    ]);

    res.json({
      ok: true,
      config,
      queues,
      db: { leads: leadCount, campaigns: campaignCount },
      running_campaigns: runningCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        provider: c.provider,
        has_system_prompt: !!(c.systemPrompt?.trim()),
      })),
      recent_failures: failures,
    });
  } catch (err) {
    next(err);
  }
});

// POST /debug/retry-failed — retry all failed jobs in both queues
router.post("/retry-failed", async (_req, res, next) => {
  try {
    const [cf, inf] = await Promise.all([
      campaignQueue.getFailed(0, 99),
      inboundQueue.getFailed(0, 99),
    ]);
    await Promise.all([...cf.map((j) => j.retry()), ...inf.map((j) => j.retry())]);
    res.json({ retried: { campaign: cf.length, inbound: inf.length } });
  } catch (err) {
    next(err);
  }
});

export default router;
