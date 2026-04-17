import Papa from "papaparse";

export interface ContactRow {
  name?: string;
  phone: string;
}

/**
 * Parse a CSV buffer into ContactRow[].
 * Accepts headers: name, phone (also: nome, telefone, numero).
 */
export function parseContactsCsv(csv: string): ContactRow[] {
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const rows: ContactRow[] = [];
  for (const row of result.data) {
    const phoneRaw = row.phone ?? row.telefone ?? row.numero ?? row.celular;
    if (!phoneRaw) continue;
    const phone = normalizePhone(phoneRaw);
    if (!phone) continue;
    const name = (row.name ?? row.nome ?? "").trim() || undefined;
    rows.push({ name, phone });
  }
  return dedupeByPhone(rows);
}

export function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/\D+/g, "");
  if (digits.length < 10) return null;
  return digits;
}

function dedupeByPhone(rows: ContactRow[]): ContactRow[] {
  const seen = new Set<string>();
  const out: ContactRow[] = [];
  for (const r of rows) {
    if (seen.has(r.phone)) continue;
    seen.add(r.phone);
    out.push(r);
  }
  return out;
}
