import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

const CRM_BASE = "https://hauzhub.com.br/requisicao/api/integracao.php";

export interface CrmStage {
  id: string;
  name: string;
}

// In-memory cache for pipeline stages (TTL: 5 min)
let stagesCache: CrmStage[] | null = null;
let stagesCachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getChave(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: "hauz_chave" } });
  return row?.value || process.env.HAUZ_CHAVE || null;
}

async function crmPost(method: string, body: Record<string, unknown>): Promise<any> {
  const chave = await getChave();
  if (!chave) {
    logger.warn({ method }, "CRM: hauz_chave not configured, skipping");
    return null;
  }
  try {
    const res = await fetch(`${CRM_BASE}?method=${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chave, ...body }),
    });
    const data = await res.json();
    if (data?.response !== "success") {
      logger.warn({ method, response: data?.response, details: data?.details }, "CRM call returned non-success");
    }
    return data;
  } catch (err) {
    logger.error({ err, method }, "CRM request failed");
    return null;
  }
}

/** Fetches pipeline stages from HauzApp, cached for 5 minutes. */
export async function getFunilStages(): Promise<CrmStage[]> {
  if (stagesCache && Date.now() - stagesCachedAt < CACHE_TTL) return stagesCache;
  const data = await crmPost("getFunilStages", {});
  if (data?.response === "success" && Array.isArray(data.details)) {
    stagesCache = data.details as CrmStage[];
    stagesCachedAt = Date.now();
    return stagesCache;
  }
  return [];
}

/**
 * Resolves a funilStageID by pattern name or "first" for the first stage.
 * Pattern is case-insensitive substring match.
 */
export async function resolveStageId(pattern: string | "first"): Promise<string | null> {
  // Allow explicit override via settings (e.g. hauz_stage_prospeccao = "5")
  const settingKey = pattern === "first" ? "hauz_stage_prospeccao" :
    pattern.toLowerCase().includes("contato") ? "hauz_stage_contato" :
    pattern.toLowerCase().includes("qualif") ? "hauz_stage_qualificado" : null;

  if (settingKey) {
    const row = await prisma.setting.findUnique({ where: { key: settingKey } });
    if (row?.value) return row.value;
  }

  const stages = await getFunilStages();
  if (!stages.length) return null;
  if (pattern === "first") return stages[0].id;
  const match = stages.find(s => s.name.toLowerCase().includes(pattern.toLowerCase()));
  return match?.id ?? null;
}

/** Creates a deal (negócio) in HauzApp CRM. Returns the crmClienteId or null. */
export async function addNegocio(params: {
  nome: string;
  phone: string;
  temperature?: number; // 0=cold, 1=warm, 2=hot
  apelido?: string;
}): Promise<string | null> {
  const data = await crmPost("addNegocio", {
    contatoNome: params.nome,
    contatoPhone: params.phone,
    negocioTemperature: params.temperature ?? 0,
    ...(params.apelido ? { negocioApelido: params.apelido } : {}),
  });
  if (data?.response === "success") {
    const id = data.details?.clienteID ?? data.details?.id ?? null;
    logger.info({ crmClienteId: id, phone: params.phone }, "CRM: negócio criado");
    return id ? String(id) : null;
  }
  return null;
}

/** Moves a deal to a given pipeline stage. */
export async function changeEtapa(crmClienteId: string, funilStageID: string): Promise<boolean> {
  const data = await crmPost("changeNegociacaoEtapa", {
    clienteID: crmClienteId,
    funilStageID,
  });
  const ok = data?.response === "success";
  if (ok) logger.info({ crmClienteId, funilStageID }, "CRM: etapa atualizada");
  return ok;
}

/** Transfers a deal to a broker in HauzApp. corretorID must be the CRM broker ID. */
export async function encaminharNegocio(crmClienteId: string, corretorID: string): Promise<boolean> {
  const data = await crmPost("imobEncaminharNegocio", {
    clienteID: crmClienteId,
    corretorID,
  });
  const ok = data?.response === "success";
  if (ok) logger.info({ crmClienteId, corretorID }, "CRM: negócio encaminhado ao corretor");
  return ok;
}

/** Fetches all brokers from CRM. */
export async function getAllCorretores(): Promise<Array<{ corretorID: string; corretorNome: string; corretorPhone: string }>> {
  const data = await crmPost("getAllCorretoresImob", {});
  if (data?.response === "success" && Array.isArray(data.details)) {
    return data.details;
  }
  return [];
}

/**
 * Move lead's CRM deal to a named stage.
 * Convenience wrapper that resolves the stage ID automatically.
 */
export async function moveLeadToStage(crmClienteId: string, stagePattern: string | "first"): Promise<void> {
  const stageId = await resolveStageId(stagePattern);
  if (!stageId) {
    logger.warn({ stagePattern }, "CRM: etapa não encontrada, pulando");
    return;
  }
  await changeEtapa(crmClienteId, stageId);
}

/**
 * Full handoff flow: move to "Lead Qualificado" stage and assign broker in CRM.
 * Looks up broker.crmId from local DB; falls back to CRM broker list by phone match.
 */
export async function handleQualifiedHandoff(crmClienteId: string, brokerId: string | null): Promise<void> {
  // 1. Move stage
  await moveLeadToStage(crmClienteId, "qualif");

  // 2. Assign broker
  if (!brokerId) return;

  const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
  if (!broker) return;

  let corretorID = broker.crmId ?? null;

  // Fallback: match by phone in CRM brokers list
  if (!corretorID) {
    const crmBrokers = await getAllCorretores();
    const match = crmBrokers.find(c =>
      c.corretorPhone?.replace(/\D/g, "").endsWith(broker.phone.replace(/\D/g, "").slice(-8))
    );
    if (match) {
      corretorID = match.corretorID;
      // Persist CRM ID to avoid repeat lookups
      await prisma.broker.update({ where: { id: brokerId }, data: { crmId: String(corretorID) } });
    }
  }

  if (corretorID) {
    await encaminharNegocio(crmClienteId, String(corretorID));
  } else {
    logger.warn({ brokerId, crmClienteId }, "CRM: corretor sem crmId, encaminhamento não realizado");
  }
}
