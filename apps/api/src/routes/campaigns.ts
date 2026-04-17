import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { parseContactsCsv } from "../lib/csv";
import {
  createCampaign,
  updateCampaign,
  startCampaign,
  pauseCampaign,
  getCampaignMetrics,
} from "../services/campaign.service";
import { upsertLeadsForCampaign } from "../services/lead.service";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MEDIA_MIME_TO_TYPE: Record<string, "image" | "video" | "document"> = {
  "image/jpeg": "image", "image/png": "image", "image/gif": "image", "image/webp": "image",
  "video/mp4": "video", "video/quicktime": "video", "video/x-msvideo": "video", "video/3gpp": "video",
  "application/pdf": "document",
};

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, !!MEDIA_MIME_TO_TYPE[file.mimetype]);
  },
});

const providerConfigSchema = z.object({
  baseUrl: z.string().optional(),
  token: z.string().optional(),
  instance: z.string().optional(),
  phoneId: z.string().optional(),
}).optional();

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["blast", "reactivation", "cobranca", "inbound"]).default("blast"),
  baseMessage: z.string().optional().default(""),
  systemPrompt: z.string().optional().default(""),
  provider: z.string().optional(),
  providerConfig: providerConfigSchema,
  delayMs: z.coerce.number().int().min(500).max(60000).optional(),
  maxPerMinute: z.coerce.number().int().min(1).max(60).optional(),
  // Reactivation-only
  qualifyQuestions: z.array(z.string()).optional(),
  handoffScore: z.coerce.number().int().min(0).max(100).optional(),
  handoffMessage: z.string().optional(),
  maxConvHours: z.coerce.number().int().min(1).max(168).optional(),
  // Follow-up
  followUpDelays: z.array(z.coerce.number().int().min(1)).optional().default([]),
  // Media
  mediaUrl: z.string().url().optional().nullable(),
  mediaType: z.enum(["image", "video", "document"]).optional().nullable(),
  // Inbound (IA Receptiva)
  properties: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional().default(""),
    link: z.string().optional().default(""),
  })).optional(),
  extraInfo: z.string().optional(),
  calendarEnabled: z.boolean().optional(),
  calendarMainId: z.string().optional().nullable(),
  brokerCalendars: z.array(z.object({
    brokerId: z.string(),
    calendarId: z.string(),
  })).optional(),
});

// POST /campaigns
router.post("/", async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const campaign = await createCampaign(data);
    res.status(201).json(campaign);
  } catch (err) { next(err); }
});

// PUT /campaigns/:id
router.put("/:id", async (req, res, next) => {
  try {
    const data = createSchema.partial().parse(req.body);
    const campaign = await updateCampaign(req.params.id, data);
    res.json(campaign);
  } catch (err) { next(err); }
});

// GET /campaigns
router.get("/", async (_req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { messages: true, leadLinks: true } } },
    });
    res.json(campaigns);
  } catch (err) { next(err); }
});

// GET /campaigns/:id
router.get("/:id", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(campaign);
  } catch (err) { next(err); }
});

// DELETE /campaigns/:id
router.delete("/:id", async (req, res, next) => {
  try {
    await prisma.campaign.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /campaigns/:id/contacts  (multipart CSV or JSON)
router.post("/:id/contacts", upload.single("file"), async (req, res, next) => {
  try {
    let rows: { name?: string; phone: string }[] = [];

    // If a JSON array is provided in body.contacts
    if (req.body.contacts) {
      try {
        const parsed = typeof req.body.contacts === "string" ? JSON.parse(req.body.contacts) : req.body.contacts;
        if (Array.isArray(parsed)) {
          rows = parsed;
        }
      } catch (err) {
        return res.status(400).json({ error: "Invalid JSON in contacts" });
      }
    } 
    // Fallback to old CSV parsing
    else if (req.file) {
      rows = parseContactsCsv(req.file.buffer.toString("utf8"));
    }

    if (rows.length === 0) return res.status(400).json({ error: "No valid contacts found. Please map Name and Phone." });
    
    // Ensure data shape and remove empty/invalid phones
    const validRows = rows.map(r => ({
      name: r.name ? String(r.name).trim() : undefined,
      phone: String(r.phone).replace(/\D+/g, "")
    })).filter(r => r.phone.length >= 10);

    const result = await upsertLeadsForCampaign(req.params.id, validRows);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /campaigns/:id/start
router.post("/:id/start", async (req, res, next) => {
  try {
    const result = await startCampaign(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /campaigns/:id/pause
router.post("/:id/pause", async (req, res, next) => {
  try {
    const result = await pauseCampaign(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /campaigns/:id/upload-media
router.post("/:id/upload-media", mediaUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No valid media file provided." });
    const mediaType = MEDIA_MIME_TO_TYPE[req.file.mimetype];
    const apiBase = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;
    const mediaUrl = `${apiBase}/uploads/${req.file.filename}`;
    await prisma.campaign.update({
      where: { id: req.params.id },
      data: { mediaUrl, mediaType },
    });
    res.json({ mediaUrl, mediaType });
  } catch (err) { next(err); }
});

// DELETE /campaigns/:id/media
router.delete("/:id/media", async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: req.params.id } });
    if (campaign.mediaUrl) {
      const filename = campaign.mediaUrl.split("/uploads/")[1];
      if (filename) {
        const filePath = path.join(UPLOADS_DIR, filename);
        fs.unlink(filePath, () => {});
      }
    }
    await prisma.campaign.update({ where: { id: req.params.id }, data: { mediaUrl: null, mediaType: null } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /campaigns/:id/metrics
router.get("/:id/metrics", async (req, res, next) => {
  try {
    const metrics = await getCampaignMetrics(req.params.id);
    res.json(metrics);
  } catch (err) { next(err); }
});

export default router;
