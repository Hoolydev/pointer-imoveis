import { prisma } from "../lib/prisma";
import type { ContactRow } from "../lib/csv";

export interface LeadFilter {
  temperature?: string;
  status?: string;
  handoff?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listLeads(filter: LeadFilter = {}) {
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, filter.limit ?? 20);
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filter.temperature) where.temperature = filter.temperature;
  if (filter.status) where.status = filter.status;
  if (filter.handoff !== undefined) where.handoff = filter.handoff;
  if (filter.search) {
    where.OR = [
      { name: { contains: filter.search, mode: "insensitive" } },
      { phone: { contains: filter.search } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ score: "desc" }, { lastInteraction: "desc" }],
      select: {
        id: true, name: true, phone: true, status: true,
        temperature: true, score: true, handoff: true,
        lastInteraction: true, createdAt: true,
      },
    }),
  ]);

  return { total, page, limit, items };
}

export async function getLeadDetail(id: string) {
  return prisma.lead.findUniqueOrThrow({
    where: { id },
    include: {
      messages: { orderBy: { timestamp: "asc" }, take: 200 },
    },
  });
}

export async function upsertLeadsForCampaign(
  campaignId: string,
  rows: ContactRow[]
): Promise<{ upserted: number }> {
  let upserted = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lead = await prisma.lead.upsert({
      where: { phone: row.phone },
      create: { phone: row.phone, name: row.name },
      update: { name: row.name ?? undefined },
    });

    await prisma.campaignLead.upsert({
      where: { campaignId_leadId: { campaignId, leadId: lead.id } },
      create: { campaignId, leadId: lead.id, variationIndex: i },
      update: {},
    });
    upserted++;
  }
  return { upserted };
}

export async function setHandoff(leadId: string, handoff: boolean) {
  return prisma.lead.update({
    where: { id: leadId },
    data: { handoff, status: handoff ? "handoff" : "engaged" },
  });
}
