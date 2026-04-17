import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getProvider } from "../providers/index";

const STAGNANT_DAYS = 3;
const COBRAR_COOLDOWN_HOURS = 12; // don't re-notify same broker within 12h
const STAGNATION_RUN_COOLDOWN_HOURS = 6; // run the full check at most every 6h

const DEFAULT_TEMPLATE =
  "Olá {nome}, você tem {total_leads} lead(s) sem atualização há mais de {dias} dias:\n{leads_lista}\n\nPor favor, entre em contato para não perder essas oportunidades!";

/**
 * Automatically sends a WhatsApp reminder to every active broker
 * who has handoff leads stagnant for more than STAGNANT_DAYS days.
 *
 * Respects a per-broker cooldown (COBRAR_COOLDOWN_HOURS) and a global
 * run cooldown stored in the Settings table (key: _stagnation_last_run).
 *
 * Returns the number of brokers notified.
 */
export async function autoCobrarStagnantBrokers(): Promise<number> {
  // Global cooldown: run at most every STAGNATION_RUN_COOLDOWN_HOURS hours
  const lastRunRow = await prisma.setting.findUnique({ where: { key: "_stagnation_last_run" } });
  const lastRunMs = lastRunRow ? new Date(lastRunRow.value).getTime() : 0;
  const cooldownMs = STAGNATION_RUN_COOLDOWN_HOURS * 60 * 60 * 1000;
  if (Date.now() - lastRunMs < cooldownMs) {
    logger.debug("stagnation check skipped (within cooldown)");
    return 0;
  }

  // Record run time immediately to prevent duplicate concurrent runs
  await prisma.setting.upsert({
    where: { key: "_stagnation_last_run" },
    update: { value: new Date().toISOString() },
    create: { key: "_stagnation_last_run", value: new Date().toISOString() },
  });

  const cutoff = new Date(Date.now() - STAGNANT_DAYS * 24 * 60 * 60 * 1000);
  const brokerCooloff = new Date(Date.now() - COBRAR_COOLDOWN_HOURS * 60 * 60 * 1000);

  const brokers = await prisma.broker.findMany({
    where: {
      status: "active",
      OR: [{ lastCobranca: { lt: brokerCooloff } }, { lastCobranca: null }],
    },
    include: {
      leads: {
        where: {
          handoff: true,
          status: { notIn: ["closed"] },
          OR: [
            { lastInteraction: { lte: cutoff } },
            { lastInteraction: null },
          ],
        },
        select: { name: true, phone: true, lastInteraction: true },
      },
    },
  });

  const provider = getProvider();
  let notified = 0;

  for (const broker of brokers) {
    if (broker.leads.length === 0) continue;

    const leadsList = broker.leads
      .map((l) => {
        const lastContact = l.lastInteraction
          ? new Date(l.lastInteraction).toLocaleDateString("pt-BR")
          : "nunca";
        return `• ${l.name ?? l.phone} (último contato: ${lastContact})`;
      })
      .join("\n");

    const message = DEFAULT_TEMPLATE
      .replace("{nome}", broker.name)
      .replace("{total_leads}", String(broker.leads.length))
      .replace("{dias}", String(STAGNANT_DAYS))
      .replace("{leads_lista}", leadsList);

    try {
      await provider.sendMessage(broker.phone, message);
      await prisma.broker.update({
        where: { id: broker.id },
        data: { lastCobranca: new Date() },
      });
      logger.info({ brokerId: broker.id, stagnantCount: broker.leads.length }, "auto-cobrar sent");
      notified++;
    } catch (err) {
      logger.error({ err, brokerId: broker.id }, "auto-cobrar send failed");
    }
  }

  return notified;
}

/**
 * Picks the active broker with the fewest assigned handoff leads (load balancing).
 * Returns null if no brokers are configured.
 */
export async function pickBrokerForLead(): Promise<string | null> {
  const brokers = await prisma.broker.findMany({
    where: { status: "active" },
    include: { _count: { select: { leads: true } } },
    orderBy: { leads: { _count: "asc" } },
  });
  return brokers[0]?.id ?? null;
}
