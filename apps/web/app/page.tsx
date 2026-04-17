import { api } from "./lib/api";

interface RecentLead {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  temperature: string;
  score: number;
  lastInteraction: string | null;
}

interface TopCampaign {
  id: string;
  name: string;
  type: string;
  sent: number;
  total: number;
}

interface Stats {
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  handoffs: number;
  qualifiedLeads: number;
  engagedLeads: number;
  totalMessages: number;
  sentToday: number;
  receivedToday: number;
  sentThisWeek: number;
  activeCampaigns: number;
  replyRateToday: number;
  avgScore: number;
  deliveryRate: number;
  recentLeads: RecentLead[];
  topCampaigns: TopCampaign[];
}

async function getStats(): Promise<Stats | null> {
  try {
    const raw = await api.get<Partial<Stats>>("/stats");
    // Defensive defaults for fields added in the new backend version
    return {
      totalLeads: 0, hotLeads: 0, warmLeads: 0, coldLeads: 0,
      handoffs: 0, qualifiedLeads: 0, engagedLeads: 0,
      totalMessages: 0, sentToday: 0, receivedToday: 0,
      sentThisWeek: 0, activeCampaigns: 0,
      replyRateToday: 0, avgScore: 0, deliveryRate: 100,
      recentLeads: [], topCampaigns: [],
      ...raw,
    } as Stats;
  }
  catch { return null; }
}

export const revalidate = 30;

const TEMP_CONFIG: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  hot:  { label: "Quente",  dot: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50" },
  warm: { label: "Morno",   dot: "bg-orange-400",  text: "text-orange-700", bg: "bg-orange-50" },
  cold: { label: "Frio",    dot: "bg-blue-400",    text: "text-blue-700",   bg: "bg-blue-50" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:       { label: "Novo",        color: "text-gray-500" },
  engaged:   { label: "Engajado",    color: "text-blue-600" },
  qualified: { label: "Qualificado", color: "text-purple-600" },
  handoff:   { label: "Handoff",     color: "text-green-600" },
  closed:    { label: "Fechado",     color: "text-gray-400" },
};

const TYPE_LABEL: Record<string, string> = {
  blast: "Disparo", reactivation: "Reaquecimento", cobranca: "Cobrança",
};

function StatCard({
  label, value, sub, icon, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent}`}>
          {icon}
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold text-gray-900 leading-none">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1.5">{sub}</div>}
      </div>
    </div>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  const safe = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function timeAgo(date: string | null) {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

export default async function DashboardPage() {
  const s = await getStats();

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="space-y-7 animate-fade-up">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting} 👋</h1>
          <p className="text-sm text-gray-500 mt-0.5 capitalize">{dateStr}</p>
        </div>
        {s && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-green-700">
              {s.activeCampaigns} campanha{s.activeCampaigns !== 1 ? "s" : ""} ativa{s.activeCampaigns !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {!s ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-700 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          API indisponível — verifique se o backend está rodando.
        </div>
      ) : (
        <>
          {/* KPI row 1 — Volume de Leads */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Leads</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="Total"
                value={s.totalLeads}
                sub="base completa"
                accent="bg-gray-100"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              />
              <StatCard
                label="Quentes"
                value={s.hotLeads}
                sub={`${s.totalLeads > 0 ? Math.round((s.hotLeads / s.totalLeads) * 100) : 0}% da base`}
                accent="bg-red-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>}
              />
              <StatCard
                label="Mornos"
                value={s.warmLeads}
                sub={`${s.totalLeads > 0 ? Math.round((s.warmLeads / s.totalLeads) * 100) : 0}% da base`}
                accent="bg-orange-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" /></svg>}
              />
              <StatCard
                label="Engajados"
                value={s.engagedLeads}
                sub="em conversa"
                accent="bg-blue-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
              />
              <StatCard
                label="Qualificados"
                value={s.qualifiedLeads}
                sub="prontos p/ corretor"
                accent="bg-purple-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>}
              />
              <StatCard
                label="Em Handoff"
                value={s.handoffs}
                sub="aguardando corretor"
                accent="bg-green-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
              />
            </div>
          </section>

          {/* KPI row 2 — Mensagens & IA */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Mensagens & Automação</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Enviadas Hoje"
                value={s.sentToday}
                sub="saída hoje"
                accent="bg-blue-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
              />
              <StatCard
                label="Recebidas Hoje"
                value={s.receivedToday}
                sub="respostas recebidas"
                accent="bg-indigo-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              />
              <StatCard
                label="Taxa de Resposta"
                value={`${s.replyRateToday}%`}
                sub="engajamento hoje"
                accent="bg-teal-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
              />
              <StatCard
                label="Semana"
                value={s.sentThisWeek}
                sub="enviadas nos últimos 7d"
                accent="bg-violet-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              />
              <StatCard
                label="Score Médio IA"
                value={s.avgScore}
                sub={`entrega ${s.deliveryRate}%`}
                accent="bg-yellow-50"
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              />
            </div>
          </section>

          {/* Bottom grid: Funil + Campanhas + Leads Recentes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Funil de conversão */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Funil de Conversão</h3>
              <div className="space-y-3">
                {[
                  { label: "Total de Leads",   value: s.totalLeads,    pct: 100,  color: "bg-gray-300" },
                  { label: "Engajados pela IA", value: s.engagedLeads,  pct: s.totalLeads > 0 ? (s.engagedLeads / s.totalLeads) * 100 : 0,  color: "bg-blue-500" },
                  { label: "Qualificados",      value: s.qualifiedLeads, pct: s.totalLeads > 0 ? (s.qualifiedLeads / s.totalLeads) * 100 : 0, color: "bg-purple-500" },
                  { label: "Em Handoff",        value: s.handoffs,      pct: s.totalLeads > 0 ? (s.handoffs / s.totalLeads) * 100 : 0,       color: "bg-green-500" },
                ].map((row, i) => (
                  <div key={i}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-gray-600">{row.label}</span>
                      <span className="text-xs font-semibold text-gray-800">{row.value}</span>
                    </div>
                    <MiniBar pct={row.pct} color={row.color} />
                  </div>
                ))}
              </div>

              {/* Temperatura breakdown */}
              <div className="mt-5 pt-4 border-t border-gray-100">
                <div className="text-xs font-semibold text-gray-500 mb-3">Temperatura da Base</div>
                <div className="space-y-2">
                  {(["hot", "warm", "cold"] as const).map((t) => {
                    const count = t === "hot" ? s.hotLeads : t === "warm" ? s.warmLeads : s.coldLeads;
                    const cfg = TEMP_CONFIG[t];
                    const pct = s.totalLeads > 0 ? Math.round((count / s.totalLeads) * 100) : 0;
                    return (
                      <div key={t} className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <span className="text-xs text-gray-600 w-14">{cfg.label}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${cfg.dot}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-700 w-6 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Campanhas ativas */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Campanhas Rodando</h3>
                <a href="/campaigns" className="text-xs text-blue-600 hover:underline font-medium">Ver todas →</a>
              </div>

              {s.topCampaigns.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
                  </div>
                  <p className="text-xs text-gray-400">Nenhuma campanha ativa</p>
                  <a href="/campaigns" className="mt-2 text-xs text-blue-600 hover:underline">Criar campanha</a>
                </div>
              ) : (
                <div className="space-y-4">
                  {s.topCampaigns.map((c) => {
                    const pct = c.total > 0 ? Math.round((c.sent / c.total) * 100) : 0;
                    const typeColors: Record<string, string> = {
                      blast: "bg-blue-100 text-blue-700",
                      reactivation: "bg-purple-100 text-purple-700",
                      cobranca: "bg-amber-100 text-amber-700",
                    };
                    return (
                      <div key={c.id}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md shrink-0 ${typeColors[c.type] ?? "bg-gray-100 text-gray-600"}`}>
                              {TYPE_LABEL[c.type] ?? c.type}
                            </span>
                            <span className="text-xs font-medium text-gray-700 truncate">{c.name}</span>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 ml-2">{pct}%</span>
                        </div>
                        <MiniBar
                          pct={pct}
                          color={c.type === "reactivation" ? "bg-purple-500" : c.type === "cobranca" ? "bg-amber-500" : "bg-blue-500"}
                        />
                        <div className="flex justify-between mt-1">
                          <span className="text-xs text-gray-400">{c.sent} msgs enviadas</span>
                          <span className="text-xs text-gray-400">{c.total} contatos</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Total messages stat */}
              <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">Total de mensagens</span>
                <span className="text-sm font-bold text-gray-800">{s.totalMessages.toLocaleString("pt-BR")}</span>
              </div>
            </div>

            {/* Leads recentes */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-800">Atividade Recente</h3>
                <a href="/leads" className="text-xs text-blue-600 hover:underline font-medium">Ver todos →</a>
              </div>

              {s.recentLeads.length === 0 ? (
                <p className="text-xs text-gray-400 py-8 text-center">Nenhum lead ainda.</p>
              ) : (
                <div className="space-y-1">
                  {s.recentLeads.map((lead) => {
                    const temp = TEMP_CONFIG[lead.temperature] ?? TEMP_CONFIG.cold;
                    const status = STATUS_CONFIG[lead.status] ?? { label: lead.status, color: "text-gray-500" };
                    return (
                      <a
                        key={lead.id}
                        href={`/leads/${lead.id}`}
                        className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-gray-50 transition group"
                      >
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {(lead.name ?? lead.phone).charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-gray-800 truncate">
                              {lead.name ?? lead.phone}
                            </span>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${temp.dot}`} />
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-xs text-gray-400">{timeAgo(lead.lastInteraction)}</span>
                          </div>
                        </div>

                        {/* Score */}
                        <div className="text-right shrink-0">
                          <div className="text-xs font-bold text-gray-700">{lead.score}</div>
                          <div className="text-xs text-gray-400">score</div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
