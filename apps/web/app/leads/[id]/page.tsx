"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import Badge from "../../components/Badge";

interface Message {
  id: string; content: string; direction: string; status: string; timestamp: string;
}
interface LeadDetail {
  id: string; name?: string; phone: string; status: string;
  temperature: string; score: number; handoff: boolean;
  metadata: Record<string, string>; messages: Message[];
}

export default function LeadDetailPage({ params }: { params: { id: string } }) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const load = () => {
    api.get<LeadDetail>(`/leads/${params.id}`)
      .then(setLead)
      .finally(() => setLoading(false));
  };
  useEffect(load, [params.id]);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  async function toggleHandoff() {
    if (!lead) return;
    try {
      await api.post(`/leads/${lead.id}/handoff`, { handoff: !lead.handoff });
      notify(lead.handoff ? "Handoff removido" : "Lead marcado para handoff");
      load();
    } catch (err: any) { notify("Erro: " + err.message); }
  }

  if (loading) return <p className="text-gray-400 text-sm mt-8">Carregando...</p>;
  if (!lead) return <p className="text-gray-400">Lead não encontrado.</p>;

  const meta = lead.metadata ?? {};

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      <a href="/leads" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">← Leads</a>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{lead.name ?? "Sem nome"}</h1>
          <p className="text-gray-400 text-sm">{lead.phone}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge label={lead.status} />
            <Badge label={lead.temperature} />
            {lead.handoff && <Badge label="handoff" />}
          </div>
        </div>
        <button
          onClick={toggleHandoff}
          className={`text-sm px-4 py-2 rounded-lg font-medium transition ${
            lead.handoff
              ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
              : "bg-purple-600 text-white hover:bg-purple-700"
          }`}
        >
          {lead.handoff ? "Reativar Bot" : "Handoff Humano"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Score", value: lead.score },
          { label: "Interesse", value: meta.interest || "—" },
          { label: "Orçamento", value: meta.budget || "—" },
          { label: "Prazo", value: meta.timeline || "—" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-lg font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-semibold mb-4">Conversa</h2>
        {lead.messages.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhuma mensagem ainda.</p>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {lead.messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs md:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                  m.direction === "outbound"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-900 rounded-bl-sm"
                }`}>
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className={`text-xs mt-1 ${m.direction === "outbound" ? "text-blue-200" : "text-gray-400"}`}>
                    {new Date(m.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {m.direction === "outbound" && ` · ${m.status}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
