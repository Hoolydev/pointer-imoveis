import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

const CRM_BASE = "https://hauzhub.com.br/requisicao/api/integracao.php";

export interface CrmStage {
    id: string;
    name: string;
}

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
          logger.warn({ method }, "CRM: hauz_chave nao configurada — acesse Configuracoes > CRM");
          return null;
    }
    try {
          const res = await fetch(`${CRM_BASE}?method=${method}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chave, ...body }),
          });
          const text = await res.text();
          let data: any = null;
          try { data = JSON.parse(text); } catch {
                  logger.warn({ method, status: res.status, text: text.slice(0, 300) }, "CRM: resposta nao e JSON");
                  return null;
          }
          if (data?.response !== "success") {
                  logger.warn({ method, response: data?.response, details: data?.details }, "CRM: retornou nao-success");
          }
          return data;
    } catch (err) {
          logger.error({ err, method }, "CRM: falha na requisicao");
          return null;
    }
}

export async function getFunilStages(): Promise<CrmStage[]> {
    if (stagesCache && Date.now() - stagesCachedAt < CACHE_TTL) return stagesCache;
    const data = await crmPost("getFunilStages", {});
    if (data?.response === "success" && Array.isArray(data.details)) {
          stagesCache = data.details as CrmStage[];
          stagesCachedAt = Date.now();
          logger.info({ count: stagesCache.length, stages: stagesCache.map((s: CrmStage) => `${s.id}:${s.name}`) }, "CRM: etapas carregadas");
          return stagesCache;
    }
    return [];
}

export async function resolveStageId(pattern: string | "first"): Promise<string | null> {
    const settingKey =
          pattern === "first" ? "hauz_stage_prospeccao"
          : pattern.toLowerCase().includes("contato") ? "hauz_stage_contato"
          : pattern.toLowerCase().includes("qualif") ? "hauz_stage_qualificado"
          : null;

  if (settingKey) {
        const row = await prisma.setting.findUnique({ where: { key: settingKey } });
        if (row?.value) {
                logger.info({ settingKey, stageId: row.value }, "CRM: etapa resolvida por setting");
                return row.value;
        }
  }

  const stages = await getFunilStages();
    if (!stages.length) {
          logger.warn({ pattern }, "CRM: nenhuma etapa no funil — verifique hauz_chave");
          return null;
    }

  if (pattern === "first") {
        logger.info({ stageId: stages[0].id, name: stages[0].name }, "CRM: usando primeira etapa");
        return stages[0].id;
  }

  const match = stages.find((s: CrmStage) => s.name.toLowerCase().includes(pattern.toLowerCase()));
    if (!match) {
          logger.warn({ pattern, available: stages.map((s: CrmStage) => s.name) }, "CRM: etapa nao encontrada por pattern — configure hauz_stage_* para override");
          return null;
    }
    return match.id;
}

export async function addNegocio(params: {
    nome: string;
    phone: string;
    temperature?: number;
    apelido?: string;
}): Promise<string | null> {
    const data = await crmPost("addNegocio", {
          contatoNome: params.nome,
          contatoPhone: params.phone,
          negocioTemperature: params.temperature ?? 0,
          ...(params.apelido ? { negocioApelido: params.apelido } : {}),
    });

  logger.info(
    { response: data?.response, details: data?.details, phone: params.phone },
        "CRM: addNegocio resposta completa"
      );

  if (data?.response === "success") {
        const rawId =
                data.details?.clienteID ??
                data.details?.negocioID ??
                data.details?.id ??
                data.details?.ID ??
                data.details?.negocio?.id ??
                data.details?.contato?.id ??
                null;
        const id = rawId != null ? String(rawId) : null;
        logger.info({ crmClienteId: id, phone: params.phone, rawDetails: data.details }, "CRM: negocio criado");
        return id;
  }
    return null;
}

export async function changeEtapa(crmClienteId: string, funilStageID: string): Promise<boolean> {
    const data = await crmPost("changeNegociacaoEtapa", { clienteID: crmClienteId, funilStageID });
    const ok = data?.response === "success";
    if (ok) logger.info({ crmClienteId, funilStageID }, "CRM: etapa atualizada");
    else logger.warn({ crmClienteId, funilStageID, data }, "CRM: falha ao atualizar etapa");
    return ok;
}

export async function encaminharNegocio(crmClienteId: string, corretorID: string): Promise<boolean> {
    const data = await crmPost("imobEncaminharNegocio", { clienteID: crmClienteId, corretorID });
    const ok = data?.response === "success";
    if (ok) logger.info({ crmClienteId, corretorID }, "CRM: negocio encaminhado ao corretor");
    else logger.warn({ crmClienteId, corretorID, data }, "CRM: falha ao encaminhar negocio");
    return ok;
}

export async function getAllCorretores(): Promise<Array<{ corretorID: string; corretorNome: string; corretorPhone: string }>> {
    const data = await crmPost("getAllCorretoresImob", {});
    if (data?.response === "success" && Array.isArray(data.details)) return data.details;
    return [];
}

export async function moveLeadToStage(crmClienteId: string, stagePattern: string | "first"): Promise<void> {
    const stageId = await resolveStageId(stagePattern);
    if (!stageId) {
          logger.warn({ stagePattern, crmClienteId }, "CRM: etapa nao resolvida");
          return;
    }
    await changeEtapa(crmClienteId, stageId);
}

export async function handleQualifiedHandoff(crmClienteId: string, brokerId: string | null): Promise<void> {
    await moveLeadToStage(crmClienteId, "qualif");
    if (!brokerId) return;
    const broker = await prisma.broker.findUnique({ where: { id: brokerId } });
    if (!broker) return;
    let corretorID = broker.crmId ?? null;
    if (!corretorID) {
          const crmBrokers = await getAllCorretores();
          const match = crmBrokers.find((c) =>
                  c.corretorPhone?.replace(/\D/g, "").endsWith(broker.phone.replace(/\D/g, "").slice(-8))
                                            );
          if (match) {
                  corretorID = match.corretorID;
                  await prisma.broker.update({ where: { id: brokerId }, data: { crmId: String(corretorID) } });
          }
    }
    if (corretorID) {
          await encaminharNegocio(crmClienteId, String(corretorID));
    } else {
          logger.warn({ brokerId, crmClienteId }, "CRM: corretor sem crmId");
    }
}
