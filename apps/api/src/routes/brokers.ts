import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { getProvider } from "../providers/index";
import { logger } from "../lib/logger";
import { autoCobrarStagnantBrokers } from "../services/broker.service";

const router = Router();

const brokerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  crmId: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

// GET /brokers
router.get("/", async (_req, res, next) => {
  try {
    const brokers = await prisma.broker.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { leads: true } } },
    });
    res.json(brokers);
  } catch (err) { next(err); }
});

// POST /brokers
router.post("/", async (req, res, next) => {
  try {
    const data = brokerSchema.parse(req.body);
    const broker = await prisma.broker.create({ data });
    res.status(201).json(broker);
  } catch (err) { next(err); }
});

// PUT /brokers/:id
router.put("/:id", async (req, res, next) => {
  try {
    const data = brokerSchema.partial().parse(req.body);
    const broker = await prisma.broker.update({ where: { id: req.params.id }, data });
    res.json(broker);
  } catch (err) { next(err); }
});

// DELETE /brokers/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await prisma.broker.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /brokers/analyze?staleDays=3
// Returns each broker with their stagnant leads (leads without interaction in X days)
// Includes handoff leads assigned to broker — the key signal for the AI to alert the broker.
router.get("/analyze", async (req, res, next) => {
  try {
    const staleDays = Math.max(1, Number(req.query.staleDays ?? 3));
    const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

    const brokers = await prisma.broker.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      include: {
        leads: {
          where: {
            OR: [
              { lastInteraction: { lte: cutoff } },
              { lastInteraction: null },
            ],
            status: { notIn: ["closed"] },
          },
          select: {
            id: true,
            name: true,
            phone: true,
            status: true,
            handoff: true,
            score: true,
            lastInteraction: true,
          },
        },
      },
    });

    const result = brokers.map((b) => ({
      id: b.id,
      name: b.name,
      phone: b.phone,
      status: b.status,
      lastCobranca: b.lastCobranca,
      stagnantLeads: b.leads,
      stagnantCount: b.leads.length,
    }));

    res.json({ staleDays, cutoff, brokers: result });
  } catch (err) { next(err); }
});

// POST /brokers/auto-cobrar
// Automatically alerts all brokers with handoff leads stagnant > 3 days.
// Called by the cron drain; also available for manual trigger.
router.post("/auto-cobrar", async (_req, res, next) => {
  try {
    const notified = await autoCobrarStagnantBrokers();
    res.json({ ok: true, notified });
  } catch (err) { next(err); }
});

// POST /brokers/:id/cobrar
// Sends a WhatsApp message to the broker listing their stagnant leads
router.post("/:id/cobrar", async (req, res, next) => {
  try {
    const staleDays = Math.max(1, Number(req.body?.staleDays ?? 5));
    const template: string = req.body?.template ?? "Olá {nome}, você tem {total_leads} lead(s) sem contato há mais de {dias} dias:\n{leads_lista}\nPor favor, entre em contato com eles!";

    const broker = await prisma.broker.findUniqueOrThrow({ where: { id: req.params.id } });

    const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
    const stagnantLeads = await prisma.lead.findMany({
      where: {
        brokerId: broker.id,
        OR: [
          { lastInteraction: { lte: cutoff } },
          { lastInteraction: null },
        ],
        status: { notIn: ["closed", "handoff"] },
      },
      select: { name: true, phone: true, lastInteraction: true },
    });

    if (stagnantLeads.length === 0) {
      return res.json({ ok: true, sent: false, reason: "No stagnant leads for this broker" });
    }

    const leadsList = stagnantLeads
      .map((l) => {
        const lastContact = l.lastInteraction
          ? new Date(l.lastInteraction).toLocaleDateString("pt-BR")
          : "nunca";
        return `• ${l.name ?? l.phone} (último contato: ${lastContact})`;
      })
      .join("\n");

    const message = template
      .replace("{nome}", broker.name)
      .replace("{total_leads}", String(stagnantLeads.length))
      .replace("{dias}", String(staleDays))
      .replace("{leads_lista}", leadsList);

    const provider = getProvider();
    const result = await provider.sendMessage(broker.phone, message);

    await prisma.broker.update({
      where: { id: broker.id },
      data: { lastCobranca: new Date() },
    });

    logger.info({ brokerId: broker.id, brokerName: broker.name, messageId: result.id }, "cobrança sent");
    res.json({ ok: true, sent: true, messageId: result.id, leadsCount: stagnantLeads.length });
  } catch (err) { next(err); }
});

// POST /brokers/:id/followup  (stub — legacy compat)
router.post("/:id/followup", async (req, res, next) => {
  try {
    const broker = await prisma.broker.findUniqueOrThrow({ where: { id: req.params.id } });
    const prompt = String(req.body?.prompt ?? "").trim();
    logger.info({ brokerId: broker.id, brokerName: broker.name, prompt }, "follow-up triggered (stub)");
    res.json({ ok: true, message: `Follow-up for ${broker.name} queued (stub)`, broker });
  } catch (err) { next(err); }
});

export default router;
