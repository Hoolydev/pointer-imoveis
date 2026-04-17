import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// Keys gerenciadas pelo frontend
const ALLOWED_KEYS = [
  "whatsapp_provider",
  "uazapi_base_url",
  "uazapi_token",
  "uazapi_instance",
  "wa_official_token",
  "wa_official_phone_id",
  "wa_official_verify_token",
  "openai_api_key",
  "llm_model",
  // HauzApp CRM
  "hauz_chave",
  "hauz_stage_prospeccao",   // funilStageID override para Prospecção (first stage)
  "hauz_stage_contato",      // funilStageID override para Contato com o Cliente
  "hauz_stage_qualificado",  // funilStageID override para Lead Qualificado
];

// GET /settings — retorna todos os pares chave/valor
router.get("/", async (_req, res, next) => {
  try {
    const rows = await prisma.setting.findMany();
    const result: Record<string, string> = {};
    for (const r of rows) result[r.key] = r.value;
    res.json(result);
  } catch (err) { next(err); }
});

// PUT /settings — salva/atualiza um ou mais pares
router.put("/", async (req, res, next) => {
  try {
    const body = req.body as Record<string, string>;
    const ops = Object.entries(body)
      .filter(([k]) => ALLOWED_KEYS.includes(k))
      .map(([key, value]) =>
        prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
      );
    await prisma.$transaction(ops);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
