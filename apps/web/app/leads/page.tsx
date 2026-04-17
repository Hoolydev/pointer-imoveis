"use client";
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import Badge from "../components/Badge";
import Link from "next/link";

interface Lead {
  id: string; name?: string; phone: string;
  status: string; temperature: string; score: number;
  handoff: boolean; lastInteraction?: string; createdAt: string;
}
interface ListResponse { total: number; page: number; limit: number; items: Lead[]; }

export default function LeadsPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [temperature, setTemperature] = useState("");
  const [handoff, setHandoff] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    setApiError(false);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (temperature) params.set("temperature", temperature);
    if (handoff) params.set("handoff", handoff);
    if (search) params.set("search", search);
    api.get<ListResponse>(`/leads?${params}`)
      .then(setData)
      .catch(() => setApiError(true))
      .finally(() => setLoading(false));
  }, [temperature, handoff, search, page]);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Leads</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <input
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select value={temperature} onChange={(e) => { setTemperature(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os temperaturas</option>
          <option value="hot">Quente</option>
          <option value="warm">Morno</option>
          <option value="cold">Frio</option>
        </select>
        <select value={handoff} onChange={(e) => { setHandoff(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos</option>
          <option value="true">Em Handoff</option>
          <option value="false">Bot ativo</option>
        </select>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : apiError ? (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          ⚠️ API indisponível — verifique se o backend está rodando em <strong>localhost:3001</strong>.
        </p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-gray-400 text-sm">Nenhum lead encontrado.</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["Nome/Telefone","Status","Temperatura","Score","Handoff","Última interação",""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{lead.name ?? "—"}</p>
                      <p className="text-xs text-gray-400">{lead.phone}</p>
                    </td>
                    <td className="px-4 py-3"><Badge label={lead.status} /></td>
                    <td className="px-4 py-3"><Badge label={lead.temperature} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${lead.score}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{lead.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {lead.handoff ? <span className="text-xs text-purple-600 font-semibold">Sim</span> : <span className="text-xs text-gray-400">Não</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {lead.lastInteraction ? new Date(lead.lastInteraction).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="text-blue-600 hover:underline text-xs font-medium">Ver</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
            <span>{data.total} leads no total</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100">
                ←
              </button>
              <span className="px-3 py-1">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100">
                →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
