import { Router } from "express";
import { prisma } from "../lib/prisma";
import { listLeads, getLeadDetail, setHandoff } from "../services/lead.service";
import { campaignQueue } from "../queues/index";
import { pickVariationIndex } from "../ai/variation";
import { logger } from "../lib/logger";

const router = Router();

// GET /leads?temperature=hot&status=engaged&page=1&limit=20&search=name
router.get("/", async (req, res, next) => {
  try {
    const result = await listLeads({
      temperature: req.query.temperature as string | undefined,
      status: req.query.status as string | undefined,
      handoff: req.query.handoff === "true" ? true : req.query.handoff === "false" ? false : undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /leads/:id  (includes full conversation)
router.get("/:id", async (req, res, next) => {
  try {
    const lead = await getLeadDetail(req.params.id);
    res.json(lead);
  } catch (err) { next(err); }
});

// POST /leads/:id/handoff  { handoff: true|false }
router.post("/:id/handoff", async (req, res, next) => {
  try {
    const handoff = req.body.handoff !== false;
    const lead = await setHandoff(req.params.id, handoff);
    res.json(lead);
  } catch (err) { next(err); }
});

/**
 * POST /leads/:id/reactivate
 * Re-enables the AI for a lead that was in handoff (e.g. broker didn't convert).
 * Finds the first active "reactivation" campaign and enqueues a message for this lead.
 * Optionally accepts { campaignId } body to target a specific campaign.
 */
router.post("/:id/reactivate", async (req, res, next) => {
  try {
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: req.params.id } });

    // Find a running reactivation campaign (or use provided campaignId)
    const campaignId = req.body?.campaignId as string | undefined;
    const campaign = campaignId
      ? await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })
      : await prisma.campaign.findFirst({ where: { type: "reactivation", status: "running" } });

    if (!campaign) {
      return res.status(404).json({
        error: "Nenhuma campanha de reativação ativa encontrada. Crie e inicie uma campanha do tipo 'reactivation'.",
      });
    }

    // Ensure lead is linked to this campaign
    await prisma.campaignLead.upsert({
      where: { campaignId_leadId: { campaignId: campaign.id, leadId: lead.id } },
      create: { campaignId: campaign.id, leadId: lead.id, variationIndex: 0 },
      update: {},
    });

    // Reset handoff — the campaignProcessor will also do this, but set it now for correctness
    await prisma.lead.update({
      where: { id: lead.id },
      data: { handoff: false, status: "engaged", activeCampaignId: campaign.id },
    });

    const variations = (campaign.variations as string[] | null) ?? [campaign.baseMessage];
    await campaignQueue.add(
      `reactivate-${lead.id}-${Date.now()}`,
      {
        leadId: lead.id,
        campaignId: campaign.id,
        variationIndex: pickVariationIndex(0, variations.length),
        type: "blast",
        followUpIndex: 0,
      },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
    );

    logger.info({ leadId: lead.id, campaignId: campaign.id }, "lead reativado");
    res.json({ ok: true, campaignId: campaign.id, campaignName: campaign.name });
  } catch (err) { next(err); }
});

export default router;
