import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

const CRM_BASE = "https://hauzhub.com.br/requisicao/api/integracao.php";

export interface CrmStage {
      id: string;
      nome: string;
}

let stagesCache: CrmStage[] | null = null;
let stagesCachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getChave(): Promise<string | null> {
      const row = await prisma.setting.findUnique({ where: { key: "hauz_chave" } });
      return row?.value || process.env.HAUZ_CHAVE || null;
}

/**
 * Formata numero WhatsApp (ex: 5562982540748) para padrao HauzHub: (62) 98254-0748
 * HauzHub rejeita qualquer formato diferente deste.
 */
export function formatPhoneForCrm(raw: string): string {
      const digits = raw.replace(/\D/g, "");
      // Remove +55 ou 55 do inicio se existir
  const local = digits.startsWith("55") && digits.length > 11 ? digits.slice(2) : digits;
      // Formato: (DDD) XXXXX-XXXX ou (DDD) XXXX-XXXX
  if (local.length === 11) {
          return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
      if (local.length === 10) {
              return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
      }
      return local;
}

async function crmPost(method: string, body: Record<string, unknown>): Promise<any> {
      const chave = await getChave();
      if (!chave) {
              logger.warn({ method }, "CRM: hauz_chave nao configurada");
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
              // HauzHub retorna details como string JSON em varios endpoints
        if (data && typeof data.details === "string") {
                  try { data.details = JSON.parse(data.details); } catch { /* manter como string */ }
        }
              if (data?.response !== "success") {
                        logger.warn({ method, response: data?.response, details: data?.details }, "CRM: nao-success");
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
              stagesCache = (data.details as any[]).map((s) => ({
                        id: String(s.id),
                        nome: s.nome ?? s.name ?? "",
              }));
              stagesCachedAt = Date.now();
              logger.info({ count: stagesCache.length, stages: stagesCache.map((s) => `${s.id}:${s.nome}`) }, "CRM: etapas");
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
                    logger.info({ settingKey, stageId: row.value }, "CRM: etapa via setting");
                    return row.value;
          }
  }

  const stages = await getFunilStages();
      if (!stages.length) { logger.warn({ pattern }, "CRM: sem etapas"); return null; }
      if (pattern === "first") return stages[0].id;
      const match = stages.find((s) => s.nome.toLowerCase().includes(pattern.toLowerCase()));
      if (!match) {
              logger.warn({ pattern, available: stages.map((s) => s.nome) }, "CRM: etapa nao encontrada");
              return null;
      }
      return match.id;
}

/**
 * Cria negocio no HauzHub.
 * IMPORTANTE: HauzHub NAO retorna clienteID no addNegocio.
 * Usamos o telefone formatado como crmClienteId persistente no banco.
 * changeNegociacaoEtapa aceita clientePhone como identificador.
 */
export async function addNegocio(params: {
      nome: string;
      phone: string;
      temperature?: number;
      apelido?: string;
}): Promise<string | null> {
      const phoneFormatted = formatPhoneForCrm(params.phone);
      const data = await crmPost("addNegocio", {
              contatoNome: params.nome || phoneFormatted,
              contatoPhone: phoneFormatted,
              negocioTemperature: params.temperature ?? 0,
              ...(params.apelido ? { negocioApelido: params.apelido } : {}),
      });

  logger.info({ response: data?.response, details: data?.details, phone: phoneFormatted }, "CRM: addNegocio");

  if (data?.response === "success") {
          // HauzHub nao retorna clienteID — usar telefone formatado como identificador
        logger.info({ crmClienteId: phoneFormatted, phone: params.phone }, "CRM: negocio criado, usando phone como ID");
          return phoneFormatted;
  }
      return null;
}

/**
 * Muda etapa do negocio. HauzHub aceita clientePhone no lugar de clienteID.
 */
export async function changeEtapa(crmClienteId: string, funilStageID: string): Promise<boolean> {
      // crmClienteId pode ser telefone formatado (ex: (62) 98254-0748) ou ID numerico
  const data = await crmPost("changeNegociacaoEtapa", {
          clienteID: crmClienteId,
          clientePhone: crmClienteId, // tenta ambos
          funilStageID,
  });
      const ok = data?.response === "success";
      if (ok) logger.info({ crmClienteId, funilStageID }, "CRM: etapa atualizada");
      else logger.warn({ crmClienteId, funilStageID, response: data?.response }, "CRM: falha etapa");
      return ok;
}

export async function encaminharNegocio(crmClienteId: string, corretorID: string): Promise<boolean> {
      const data = await crmPost("imobEncaminharNegocio", {
              clienteID: crmClienteId,
              clientePhone: crmClienteId,
              corretorID,
      });
      const ok = data?.response === "success";
      if (ok) logger.info({ crmClienteId, corretorID }, "CRM: negocio encaminhado");
      else logger.warn({ crmClienteId, corretorID, response: data?.response }, "CRM: falha encaminhar");
      return ok;
}

export async function getAllCorretores(): Promise<Array<{ corretorID: string; corretorNome: string; corretorPhone: string }>> {
      const data = await crmPost("getAllCorretoresImob", {});
      if (data?.response === "success" && Array.isArray(data.details)) return data.details;
      return [];
}

export async function moveLeadToStage(crmClienteId: string, stagePattern: string | "first"): Promise<void> {
      const stageId = await resolveStageId(stagePattern);
      if (!stageId) { logger.warn({ stagePattern, crmClienteId }, "CRM: etapa nao resolvida"); return; }
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
