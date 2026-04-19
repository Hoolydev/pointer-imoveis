import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { inboundQueue } from "../queues/index";
import type { InboundMessage } from "../providers/types";

/**
 * Handle an inbound message from any provider:
 * 1. Upsert lead
 * 2. Enqueue agent reply job
 * 3. Fire drain endpoint for low-latency reply (fire-and-forget)
 */
export async function handleInbound(msg: InboundMessage) {
  // Find the best running campaign to assign to leads with no active campaign.
  // Priority 1: "inbound" (IA Receptiva) — built specifically for receptive mode.
  // Priority 2: any running blast/reactivation with a system prompt — covers the case
  //   where someone shares the blasted number with a third party: that new contact
  //   gets qualified by the same AI persona as the original campaign.
  // "cobranca" campaigns never use AI, so they're excluded.
  const [inboundCampaign, blastCampaign] = await Promise.all([
    prisma.campaign.findFirst({
      where: { type: "inbound", status: "running" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.campaign.findFirst({
      where: {
        status: "running",
        type: { in: ["blast", "reactivation"] },
        NOT: { systemPrompt: "" },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const fallbackCampaign = inboundCampaign ?? blastCampaign;

  const existing = await prisma.lead.findUnique({ where: { phone: msg.from } });

  const lead = existing
    ? await prisma.lead.update({
        where: { phone: msg.from },
        data: {
          lastInteraction: new Date(),
          // Assign campaign only if the lead has no active campaign yet
          ...(!existing.activeCampaignId && fallbackCampaign
            ? { activeCampaignId: fallbackCampaign.id }
            : {}),
        },
      })
    : await prisma.lead.create({
        data: {
          phone: msg.from,
          status: "new",
          activeCampaignId: fallbackCampaign?.id ?? undefined,
        },
      });

  await inboundQueue.add(
    `reply-${msg.messageId}`,
    {
      leadId: lead.id,
      inboundText: msg.text,
      inboundMessageId: msg.messageId,
      providerName: msg.providerName,
      mediaUrl: msg.mediaUrl,
      mediaType: msg.mediaType,
      mediaFileName: msg.mediaFileName,
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 50,
      removeOnFail: 100,
    }
  );

  // Kick the drain handler immediately so reply lands fast
  const baseUrl = process.env.PUBLIC_BASE_URL;
  const secret = process.env.CRON_SECRET ?? "";
  if (baseUrl) {
    fetch(`${baseUrl}/api/cron/drain`, {
      method: "GET",
      headers: { "x-cron-secret": secret },
    }).catch((e) => logger.warn({ e }, "drain self-trigger failed"));
  }

  logger.info({ leadId: lead.id, from: msg.from }, "inbound queued");
  return lead;
}

export async function getDashboardStats() {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalLeads, hotLeads, warmLeads, coldLeads,
    handoffs, qualifiedLeads, engagedLeads,
    totalMessages, sentToday, receivedToday,
    sentThisWeek, activeCampaigns,
    failedToday, recentLeads, scoreAgg, topCampaigns,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { temperature: "hot" } }),
    prisma.lead.count({ where: { temperature: "warm" } }),
    prisma.lead.count({ where: { temperature: "cold" } }),
    prisma.lead.count({ where: { handoff: true } }),
    prisma.lead.count({ where: { status: "qualified" } }),
    prisma.lead.count({ where: { status: "engaged" } }),
    prisma.message.count(),
    prisma.message.count({
      where: { direction: "outbound", status: "sent", timestamp: { gte: todayStart } },
    }),
    prisma.message.count({
      where: { direction: "inbound", timestamp: { gte: todayStart } },
    }),
    prisma.message.count({
      where: { direction: "outbound", status: "sent", timestamp: { gte: weekStart } },
    }),
    prisma.campaign.count({ where: { status: "running" } }),
    prisma.message.count({
      where: { direction: "outbound", status: "failed", timestamp: { gte: todayStart } },
    }),
    prisma.lead.findMany({
      orderBy: { lastInteraction: "desc" },
      take: 6,
      select: { id: true, name: true, phone: true, status: true, temperature: true, score: true, lastInteraction: true },
    }),
    prisma.lead.aggregate({ _avg: { score: true } }),
    prisma.campaign.findMany({
      where: { status: "running" },
      select: {
        id: true, name: true, type: true,
        _count: { select: { messages: true, leadLinks: true } },
      },
      take: 4,
    }),
  ]);

  const replyRateToday = sentToday > 0 ? Math.round((receivedToday / sentToday) * 100) : 0;
  const avgScore = Math.round(scoreAgg._avg.score ?? 0);
  const deliveryRate = (sentToday + failedToday) > 0
    ? Math.round((sentToday / (sentToday + failedToday)) * 100)
    : 100;

  return {
    totalLeads, hotLeads, warmLeads, coldLeads,
    handoffs, qualifiedLeads, engagedLeads,
    totalMessages, sentToday, receivedToday,
    sentThisWeek, activeCampaigns,
    replyRateToday, avgScore, deliveryRate,
    recentLeads,
    topCampaigns: topCampaigns.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      sent: c._count.messages,
      total: c._count.leadLinks,
    })),
  };
}
