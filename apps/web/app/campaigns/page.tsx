"use client";
import { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";
import Badge from "../components/Badge";

/* ─── Types ─────────────────────────────────────────────────── */
interface Campaign {
  id: string; name: string; type: string; status: string;
  provider: string; maxPerMinute: number; createdAt: string;
  mediaUrl?: string | null; mediaType?: string | null;
  _count?: { messages: number; leadLinks: number };
}
type CampaignType = "blast" | "reactivation" | "cobranca" | "inbound";
interface ProviderConfig { baseUrl: string; token: string; instance: string; phoneId: string; }
interface Property { id: string; name: string; description: string; link: string; }

interface FormState {
  name: string; type: CampaignType; baseMessage: string; systemPrompt: string;
  provider: string; providerConfig: ProviderConfig;
  delayMs: string; maxPerMinute: string;
  qualifyQuestions: string[]; handoffScore: string;
  handoffMessage: string; maxConvHours: string; followUpDelays: string[];
  manualNumbers: string[];
  // IA Receptiva
  properties: Property[]; extraInfo: string;
  calendarEnabled: boolean; calendarMainId: string; brokerCalendars: string;
}

/* ─── Constants ──────────────────────────────────────────────── */
const EMPTY_PC: ProviderConfig = { baseUrl: "", token: "", instance: "", phoneId: "" };
const EMPTY_FORM: FormState = {
  name: "", type: "blast", baseMessage: "", systemPrompt: "",
  provider: "uazapi", providerConfig: { ...EMPTY_PC },
  delayMs: "3000", maxPerMinute: "20",
  qualifyQuestions: [
    "Qual tipo de imóvel você procura?",
    "Qual é o seu orçamento aproximado?",
    "Qual é o prazo para compra/locação?",
    "Em qual região/bairro tem interesse?",
  ],
  handoffScore: "70",
  handoffMessage: "Ótimo! Vou te conectar com um de nossos corretores agora. Aguarde um momento!",
  maxConvHours: "48", followUpDelays: [], manualNumbers: [],
  properties: [], extraInfo: "", calendarEnabled: false,
  calendarMainId: "", brokerCalendars: "",
};

const TYPE_META: Record<CampaignType, {
  label: string; desc: string; icon: React.ReactNode;
  gradient: string; border: string; badge: string;
}> = {
  blast: {
    label: "Disparo",
    desc: "Envio em massa para uma lista de contatos sem conversa automática por IA.",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>,
    gradient: "from-blue-50 to-blue-100/60", border: "border-blue-200", badge: "bg-blue-100 text-blue-700",
  },
  reactivation: {
    label: "Reaquecimento",
    desc: "Disparo + IA qualificadora que conversa e pontua os leads automaticamente.",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>,
    gradient: "from-purple-50 to-purple-100/60", border: "border-purple-200", badge: "bg-purple-100 text-purple-700",
  },
  cobranca: {
    label: "Cobrança",
    desc: "Lembretes e cobranças financeiras sem integração com CRM.",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>,
    gradient: "from-amber-50 to-amber-100/60", border: "border-amber-200", badge: "bg-amber-100 text-amber-700",
  },
  inbound: {
    label: "IA Receptiva",
    desc: "Número sempre ativo que a IA atende automaticamente, apresenta imóveis e agenda visitas.",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.575 1.399a2.25 2.25 0 01-2.999 0L12 13.5m7.8 1.5a2.25 2.25 0 01.338 3.064A9.75 9.75 0 0112 21a9.75 9.75 0 01-7.8-3.936 2.25 2.25 0 01.337-3.064" /></svg>,
    gradient: "from-emerald-50 to-emerald-100/60", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700",
  },
};

const TYPE_LABEL: Record<string, string> = {
  blast: "Disparo", reactivation: "Reaquecimento", cobranca: "Cobrança", inbound: "IA Receptiva",
};

/* ─── Small helpers ──────────────────────────────────────────── */
function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition" {...props} />
    </div>
  );
}
function Textarea({ label, ...props }: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <textarea className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" {...props} />
    </div>
  );
}

/* ─── Type Selector Step ─────────────────────────────────────── */
function TypeSelector({ onSelect }: { onSelect: (t: CampaignType) => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 animate-fade-up">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Nova Campanha</h2>
        <p className="text-sm text-gray-500 mb-7">Escolha o tipo de campanha para começar</p>
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(TYPE_META) as CampaignType[]).map((t) => {
            const m = TYPE_META[t];
            return (
              <button
                key={t}
                onClick={() => onSelect(t)}
                className={`group text-left rounded-2xl border-2 ${m.border} bg-gradient-to-br ${m.gradient} p-5 hover:shadow-md transition-all hover:scale-[1.02] active:scale-[0.99]`}
              >
                <div className="text-gray-600 mb-3 group-hover:scale-110 transition-transform inline-block">{m.icon}</div>
                <div className="font-semibold text-gray-900 mb-1">{m.label}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{m.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─── Section Wrapper ────────────────────────────────────────── */
function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <div className={`px-5 py-3 border-b border-gray-100 ${accent ?? "bg-gray-50"}`}>
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{title}</span>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────── */
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);
  const [step, setStep] = useState<"list" | "type-select" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [showProviderConfig, setShowProviderConfig] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, providerConfig: { ...EMPTY_PC } });

  // File refs/state
  const csvRef = useRef<HTMLInputElement>(null);
  const newCsvRef = useRef<HTMLInputElement>(null);
  const mediaRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [currentMediaUrl, setCurrentMediaUrl] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [mappedData, setMappedData] = useState<any[]>([]);
  const [nameCol, setNameCol] = useState("");
  const [phoneCol, setPhoneCol] = useState("");
  const [newQuestion, setNewQuestion] = useState("");
  const [newNumber, setNewNumber] = useState("");

  const load = async () => {
    try { setCampaigns(await api.get<Campaign[]>("/campaigns")); setApiError(false); }
    catch { setApiError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3500); }
  function sf<K extends keyof FormState>(key: K, val: FormState[K]) { setForm(f => ({ ...f, [key]: val })); }
  function spc(k: keyof ProviderConfig, v: string) { setForm(f => ({ ...f, providerConfig: { ...f.providerConfig, [k]: v } })); }
  function buildPC() { const c = form.providerConfig; return (!c.token && !c.baseUrl && !c.phoneId) ? null : c; }

  function openNew() {
    setStep("type-select");
    setEditingId(null);
    resetFormState();
  }

  function selectType(t: CampaignType) {
    setForm(f => ({ ...f, type: t }));
    setStep("form");
  }

  function resetFormState() {
    setForm({ ...EMPTY_FORM, providerConfig: { ...EMPTY_PC } });
    setShowProviderConfig(false);
    setCsvFile(null); setFileHeaders([]); setMappedData([]);
    setMediaFile(null); setCurrentMediaUrl(null); setNameCol(""); setPhoneCol("");
    if (newCsvRef.current) newCsvRef.current.value = "";
    if (mediaRef.current) mediaRef.current.value = "";
  }

  function handleEdit(c: any) {
    const pc = c.providerConfig as ProviderConfig | null;
    setForm({
      name: c.name, type: c.type as CampaignType, baseMessage: c.baseMessage,
      systemPrompt: c.systemPrompt ?? "", provider: c.provider,
      providerConfig: pc ? { ...EMPTY_PC, ...pc } : { ...EMPTY_PC },
      delayMs: c.delayMs.toString(), maxPerMinute: c.maxPerMinute.toString(),
      qualifyQuestions: c.qualifyQuestions ?? [...EMPTY_FORM.qualifyQuestions],
      handoffScore: c.handoffScore?.toString() ?? "70",
      handoffMessage: c.handoffMessage ?? EMPTY_FORM.handoffMessage,
      maxConvHours: c.maxConvHours?.toString() ?? "48",
      followUpDelays: c.followUpDelays?.map(String) ?? [],
      manualNumbers: [],
      properties: (c.properties as Property[]) ?? [],
      extraInfo: c.extraInfo ?? "",
      calendarEnabled: c.calendarEnabled ?? false,
      calendarMainId: c.calendarMainId ?? "",
      brokerCalendars: c.brokerCalendars ? JSON.stringify(c.brokerCalendars, null, 2) : "",
    });
    setShowProviderConfig(!!(pc?.token || pc?.baseUrl || pc?.phoneId));
    setEditingId(c.id); setStep("form");
    setCsvFile(null); setFileHeaders([]); setMappedData([]);
    setMediaFile(null); setCurrentMediaUrl(c.mediaUrl ?? null);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setCsvFile(file);
    try {
      const xlsx = await import("xlsx");
      const wb = xlsx.read(await file.arrayBuffer(), { type: "array" });
      const data = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (data.length > 0) {
        setMappedData(data as any[]);
        const headers = Object.keys(data[0] as object);
        setFileHeaders(headers);
        setNameCol(headers.find(h => /nome|name/i.test(h)) ?? "");
        setPhoneCol(headers.find(h => /telefone|celular|numero|phone|contato/i.test(h)) ?? "");
      }
    } catch { /* fallback to backend parse */ }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ownConfig = buildPC();
      const payload: Record<string, unknown> = {
        name: form.name, type: form.type, baseMessage: form.baseMessage,
        provider: form.provider, providerConfig: ownConfig,
        delayMs: Number(form.delayMs), maxPerMinute: Number(form.maxPerMinute),
        followUpDelays: form.followUpDelays.map(Number).filter(n => !isNaN(n) && n > 0),
      };

      if (form.type === "reactivation") {
        payload.systemPrompt = form.systemPrompt;
        payload.qualifyQuestions = form.qualifyQuestions;
        payload.handoffScore = Number(form.handoffScore);
        payload.handoffMessage = form.handoffMessage;
        payload.maxConvHours = Number(form.maxConvHours);
      }

      if (form.type === "inbound") {
        payload.systemPrompt = form.systemPrompt;
        payload.properties = form.properties;
        payload.extraInfo = form.extraInfo;
        payload.calendarEnabled = form.calendarEnabled;
        payload.calendarMainId = form.calendarMainId || null;
        try {
          payload.brokerCalendars = form.brokerCalendars ? JSON.parse(form.brokerCalendars) : [];
        } catch { payload.brokerCalendars = []; }
      }

      let createdId = editingId;
      if (editingId) {
        await api.put(`/campaigns/${editingId}`, payload);
      } else {
        const created = await api.post<Campaign>("/campaigns", payload);
        createdId = created.id;
      }

      // Upload media
      if (mediaFile && createdId) {
        const fd = new FormData(); fd.append("file", mediaFile);
        try {
          const r = await api.postForm<{ mediaUrl: string }>(`/campaigns/${createdId}/upload-media`, fd);
          setCurrentMediaUrl(r.mediaUrl);
        } catch (err: any) { notify("Campanha salva, mas erro ao enviar mídia: " + err.message); }
      }

      // Import contacts (non-inbound)
      if (form.type !== "inbound" && createdId) {
        if (csvFile && mappedData.length > 0 && phoneCol) {
          const contacts = mappedData.map(row => ({ name: nameCol ? row[nameCol] : undefined, phone: row[phoneCol] }));
          if (form.manualNumbers.length > 0) contacts.push(...form.manualNumbers.map(p => ({ phone: p })));
          const r = await api.post<{ upserted: number }>(`/campaigns/${createdId}/contacts`, { contacts });
          notify(`Salvo! ${r.upserted} contatos importados.`);
        } else if (csvFile) {
          const fd = new FormData(); fd.append("file", csvFile);
          await api.postForm<{ upserted: number }>(`/campaigns/${createdId}/contacts`, fd);
          if (form.manualNumbers.length > 0) {
            await api.post(`/campaigns/${createdId}/contacts`, { contacts: form.manualNumbers.map(p => ({ phone: p })) });
          }
          notify("Salvo! Contatos importados.");
        } else if (form.manualNumbers.length > 0) {
          const r = await api.post<{ upserted: number }>(`/campaigns/${createdId}/contacts`, {
            contacts: form.manualNumbers.map(p => ({ phone: p }))
          });
          notify(editingId ? `Atualizado! ${r.upserted} contatos adicionados.` : `Criado! ${r.upserted} contatos adicionados.`);
        } else {
          notify(editingId ? "Campanha atualizada!" : "Campanha criada!");
        }
      } else {
        notify(editingId ? "Campanha atualizada!" : "Campanha criada!");
      }

      setStep("list");
      setEditingId(null);
      resetFormState();
      load();
    } catch (err: any) {
      notify("Erro: " + (err.message ?? "API indisponível"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(id: string, action: "start" | "pause") {
    try { await api.post(`/campaigns/${id}/${action}`, {}); notify(action === "start" ? "Iniciada!" : "Pausada!"); load(); }
    catch (err: any) { notify("Erro: " + err.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta campanha? Essa ação é irreversível.")) return;
    try { await api.delete(`/campaigns/${id}`); notify("Campanha excluída."); load(); }
    catch (err: any) { notify("Erro: " + err.message); }
  }

  async function handleCsvUpload(campaignId: string) {
    const file = csvRef.current?.files?.[0]; if (!file) return;
    setUploadingId(campaignId);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await api.postForm<{ upserted: number }>(`/campaigns/${campaignId}/contacts`, fd);
      notify(`${r.upserted} contatos importados!`); load();
    } catch (err: any) { notify("Erro: " + err.message); }
    finally { setUploadingId(null); if (csvRef.current) csvRef.current.value = ""; }
  }

  async function removeMedia(campaignId: string) {
    try { await api.delete(`/campaigns/${campaignId}/media`); setCurrentMediaUrl(null); notify("Mídia removida."); }
    catch (err: any) { notify("Erro ao remover mídia: " + err.message); }
  }

  // ── Property helpers
  function addProperty() {
    sf("properties", [...form.properties, { id: `p_${Date.now()}`, name: "", description: "", link: "" }]);
  }
  function updateProperty(id: string, key: keyof Property, val: string) {
    sf("properties", form.properties.map(p => p.id === id ? { ...p, [key]: val } : p));
  }
  function removeProperty(id: string) {
    sf("properties", form.properties.filter(p => p.id !== id));
  }

  const meta = TYPE_META[form.type];

  /* ═══════════════════════════════════════════════════════════ */
  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-lg z-50 text-sm font-medium">
          {toast}
        </div>
      )}

      {/* ── Type selector overlay ── */}
      {step === "type-select" && (
        <TypeSelector onSelect={selectType} />
      )}

      {/* ── List view ── */}
      {step === "list" && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
              <p className="text-sm text-gray-500 mt-0.5">Gerencie disparos, reaquecimentos e IA receptiva</p>
            </div>
            <button onClick={openNew}
              className="bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Nova Campanha
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : apiError ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 text-sm text-amber-700">
              ⚠️ API indisponível — verifique se o backend está rodando em <strong>localhost:3001</strong>.
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <div className="text-4xl mb-3">📣</div>
              <p className="text-sm">Nenhuma campanha ainda.</p>
              <button onClick={openNew} className="mt-3 text-blue-600 text-sm hover:underline">Criar primeira campanha</button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((c) => {
                const m = TYPE_META[c.type as CampaignType] ?? TYPE_META.blast;
                return (
                  <div key={c.id} className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col md:flex-row md:items-center gap-4 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">{c.name}</span>
                        <Badge label={c.status} />
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${m.badge}`}>{m.label}</span>
                        <span className="text-xs text-gray-400">{c.provider}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {c._count?.leadLinks ?? 0} contatos · {c._count?.messages ?? 0} msgs · {c.maxPerMinute}/min
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.type !== "inbound" && (
                        <label className="cursor-pointer text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition">
                          Importar CSV
                          <input ref={csvRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={() => handleCsvUpload(c.id)} />
                        </label>
                      )}
                      {uploadingId === c.id && <span className="text-xs text-gray-400">importando...</span>}
                      {c.status !== "running" && (
                        <button onClick={() => handleDelete(c.id)} className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg font-medium hover:bg-red-50 hover:border-red-300 transition">Excluir</button>
                      )}
                      {c.status !== "running" && (
                        <button onClick={() => handleEdit(c)} className="text-xs border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg font-medium hover:bg-gray-50 transition">Editar</button>
                      )}
                      {c.status !== "running" && c.type !== "inbound" && (
                        <button onClick={() => handleAction(c.id, "start")} className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 transition">Iniciar</button>
                      )}
                      {c.status !== "running" && c.type === "inbound" && (
                        <button onClick={() => handleAction(c.id, "start")} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-emerald-700 transition">Ativar IA</button>
                      )}
                      {c.status === "running" && (
                        <button onClick={() => handleAction(c.id, "pause")} className="text-xs bg-yellow-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-yellow-600 transition">Pausar</button>
                      )}
                      <a href={`/campaigns/${c.id}`} className="text-xs text-blue-600 hover:underline font-medium px-1">Ver métricas</a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Form view ── */}
      {step === "form" && (
        <div className="max-w-2xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-7">
            <button onClick={() => { setStep(editingId ? "list" : "type-select"); if (!editingId) resetFormState(); }}
              className="p-2 rounded-xl hover:bg-gray-100 transition text-gray-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{editingId ? "Editar" : "Nova"} Campanha</h1>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.badge}`}>{meta.label}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{meta.desc}</p>
            </div>
          </div>

          {/* Change type (edit mode) */}
          {editingId && (
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Campanha</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(TYPE_META) as CampaignType[]).map(t => {
                  const m = TYPE_META[t];
                  return (
                    <button key={t} type="button" onClick={() => sf("type", t)}
                      className={`py-2 px-3 rounded-xl border-2 text-xs font-semibold transition ${form.type === t ? `${m.border} ${m.badge}` : "border-gray-200 text-gray-500 hover:border-gray-300"}`}>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-5">

            {/* ── Identificação ── */}
            <Section title="Identificação">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Nome da campanha" required value={form.name} onChange={e => sf("name", e.target.value)} placeholder="Ex: Reaquecimento Zona Sul" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Provider WhatsApp</label>
                  <select value={form.provider} onChange={e => sf("provider", e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
                    <option value="uazapi">Uazapi</option>
                    <option value="official">WhatsApp Oficial (Meta)</option>
                    <option value="mock">Mock (dev)</option>
                  </select>
                </div>
              </div>
            </Section>

            {/* ── Credenciais por campanha ── */}
            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <button type="button" onClick={() => setShowProviderConfig(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 hover:bg-gray-100 text-sm transition">
                <span className="font-medium text-gray-700">
                  Credenciais exclusivas desta campanha
                  {buildPC() && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">configurado</span>}
                </span>
                <span className="text-gray-400 text-xs">{showProviderConfig ? "▲" : "▼"}</span>
              </button>
              {showProviderConfig && (
                <div className="px-5 py-4 space-y-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500">Deixe em branco para usar as credenciais globais em Configurações.</p>
                  {form.provider === "uazapi" && (
                    <>
                      <Input label="URL da Instância" type="url" value={form.providerConfig.baseUrl} onChange={e => spc("baseUrl", e.target.value)} placeholder="https://sua-instancia.uazapi.com" />
                      <Input label="Token" type="password" value={form.providerConfig.token} onChange={e => spc("token", e.target.value)} placeholder="Seu token Uazapi" />
                    </>
                  )}
                  {form.provider === "official" && (
                    <>
                      <Input label="Token de Acesso (Bearer)" type="password" value={form.providerConfig.token} onChange={e => spc("token", e.target.value)} placeholder="EAAxxxxxx..." />
                      <Input label="Phone Number ID" value={form.providerConfig.phoneId} onChange={e => spc("phoneId", e.target.value)} placeholder="1234567890" />
                    </>
                  )}
                  {form.provider === "mock" && <p className="text-xs text-gray-400 italic">Mock não precisa de credenciais.</p>}
                </div>
              )}
            </div>

            {/* ── Mensagem base (outbound types) ── */}
            {form.type !== "inbound" && (
              <Section title="Mensagem">
                <Textarea label={form.type === "reactivation" ? "Mensagem inicial (enviada ao contato)" : "Mensagem"}
                  required rows={3} value={form.baseMessage} onChange={e => sf("baseMessage", e.target.value)}
                  placeholder={form.type === "cobranca"
                    ? "Olá {nome}! Identificamos um pagamento em aberto. Entre em contato para regularizar."
                    : "Olá {nome}! Temos novidades em imóveis na sua região. Posso te ajudar?"}
                />
                {/* Media */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Mídia <span className="font-normal text-gray-400">(opcional — foto, vídeo ou PDF junto à mensagem)</span>
                  </label>
                  {currentMediaUrl && !mediaFile ? (
                    <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                      <span className="text-sm text-gray-700 flex-1 truncate">{currentMediaUrl.split("/").pop()}</span>
                      {editingId && <button type="button" onClick={() => removeMedia(editingId)} className="text-xs text-red-500 hover:text-red-700">Remover</button>}
                    </div>
                  ) : (
                    <div className={`border-2 border-dashed rounded-xl px-4 py-3 text-center transition ${mediaFile ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}>
                      <input ref={mediaRef} type="file" accept="image/*,video/mp4,video/quicktime,application/pdf" className="hidden" id="campaign-media"
                        onChange={e => setMediaFile(e.target.files?.[0] ?? null)} />
                      <label htmlFor="campaign-media" className="cursor-pointer">
                        {mediaFile ? <span className="text-sm text-blue-700 font-medium">📎 {mediaFile.name}</span>
                          : <span className="text-sm text-gray-500">Clique para selecionar <span className="text-blue-600 underline">foto, vídeo ou PDF</span></span>}
                      </label>
                      {mediaFile && <button type="button" onClick={() => { setMediaFile(null); if (mediaRef.current) mediaRef.current.value = ""; }} className="ml-3 text-xs text-red-500 hover:text-red-700">remover</button>}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">A mensagem será usada como legenda da mídia.</p>
                </div>
              </Section>
            )}

            {/* ── IA Receptiva ── */}
            {form.type === "inbound" && (
              <>
                <Section title="IA & Comportamento" accent="bg-emerald-50">
                  <Textarea label="System Prompt — Como a IA deve se comportar" required rows={5}
                    value={form.systemPrompt} onChange={e => sf("systemPrompt", e.target.value)}
                    placeholder="Você é a assistente virtual da Pointer Imóveis. Seu objetivo é entender o que o cliente procura, apresentar imóveis da carteira que se encaixem no perfil e agendar visitas. Seja sempre cordial, natural e profissional." />
                  <Textarea label="Informações Gerais — Dados da empresa, horários, políticas, etc." rows={4}
                    value={form.extraInfo} onChange={e => sf("extraInfo", e.target.value)}
                    placeholder="Funcionamos de segunda a sexta das 8h às 18h e aos sábados das 8h às 12h. Nosso escritório fica na Rua Exemplo, 100 - Centro. Trabalhamos com compra, venda e locação." />
                </Section>

                <Section title="Carteira de Imóveis" accent="bg-emerald-50">
                  <p className="text-xs text-gray-500">Adicione os imóveis que a IA pode apresentar. Aceita link (site, vídeo, tour virtual) e descrição.</p>
                  <div className="space-y-3">
                    {form.properties.map((prop) => (
                      <div key={prop.id} className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-gray-600">Imóvel</span>
                          <button type="button" onClick={() => removeProperty(prop.id)} className="text-xs text-red-500 hover:text-red-700">Remover</button>
                        </div>
                        <Input label="Nome / Identificador" value={prop.name} onChange={e => updateProperty(prop.id, "name", e.target.value)} placeholder="Apto 2Q - Zona Sul, R$ 380mil" />
                        <Textarea label="Descrição" rows={2} value={prop.description} onChange={e => updateProperty(prop.id, "description", e.target.value)} placeholder="2 quartos, 1 vaga, 65m², próximo ao metrô, aceita financiamento..." />
                        <Input label="Link (site, vídeo, tour virtual, foto)" type="url" value={prop.link} onChange={e => updateProperty(prop.id, "link", e.target.value)} placeholder="https://..." />
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addProperty}
                    className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition">
                    + Adicionar Imóvel
                  </button>
                </Section>

                <Section title="Google Agenda" accent="bg-blue-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-800">Ativar agendamento por IA</div>
                      <div className="text-xs text-gray-500 mt-0.5">A IA poderá sugerir e registrar visitas diretamente nas agendas</div>
                    </div>
                    <button type="button" onClick={() => sf("calendarEnabled", !form.calendarEnabled)}
                      className={`relative w-10 h-5.5 rounded-full transition-colors ${form.calendarEnabled ? "bg-blue-600" : "bg-gray-300"}`}
                      style={{ width: 40, height: 22 }}>
                      <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full shadow transition-transform ${form.calendarEnabled ? "translate-x-4.5" : ""}`}
                        style={{ width: 18, height: 18, transform: form.calendarEnabled ? "translateX(18px)" : "translateX(0)" }} />
                    </button>
                  </div>

                  {form.calendarEnabled && (
                    <>
                      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
                        <strong>Para conectar:</strong> Vá em <a href="/configuracoes" className="underline">Configurações</a> → Google Agenda e cole o ID do calendário abaixo após conectar.
                      </div>
                      <Input label="ID da Agenda Principal (Pointer Imóveis)"
                        value={form.calendarMainId} onChange={e => sf("calendarMainId", e.target.value)}
                        placeholder="example@group.calendar.google.com" />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Sub-agendas dos Corretores (JSON)</label>
                        <textarea rows={4} value={form.brokerCalendars} onChange={e => sf("brokerCalendars", e.target.value)}
                          className="w-full border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                          placeholder={`[
  { "brokerId": "abc123", "calendarId": "corretor1@group.calendar.google.com" },
  { "brokerId": "def456", "calendarId": "corretor2@group.calendar.google.com" }
]`} />
                        <p className="text-xs text-gray-400 mt-1">Quando o cliente marcar uma visita, o sistema direciona para a agenda do corretor responsável.</p>
                      </div>
                    </>
                  )}
                </Section>
              </>
            )}

            {/* ── IA — Reaquecimento ── */}
            {form.type === "reactivation" && (
              <Section title="IA — Qualificação" accent="bg-purple-50">
                <Textarea label="System Prompt" required rows={4} value={form.systemPrompt} onChange={e => sf("systemPrompt", e.target.value)}
                  placeholder="Você é um assistente de vendas especializado em imóveis. Qualifique o lead perguntando sobre tipo de imóvel, orçamento e prazo..." />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Perguntas de Qualificação</label>
                  <div className="space-y-2 mb-2">
                    {form.qualifyQuestions.map((q, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                        <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}.</span>
                        <span className="text-sm text-gray-700 flex-1">{q}</span>
                        <button type="button" onClick={() => sf("qualifyQuestions", form.qualifyQuestions.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newQuestion} onChange={e => setNewQuestion(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (newQuestion.trim()) { sf("qualifyQuestions", [...form.qualifyQuestions, newQuestion.trim()]); setNewQuestion(""); } } }}
                      placeholder="Nova pergunta..." className="flex-1 border border-gray-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="button" onClick={() => { if (newQuestion.trim()) { sf("qualifyQuestions", [...form.qualifyQuestions, newQuestion.trim()]); setNewQuestion(""); } }}
                      className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-medium transition">+ Add</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Score mín. p/ handoff</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={100} value={form.handoffScore} onChange={e => sf("handoffScore", e.target.value)} className="flex-1" />
                      <span className="text-sm font-bold text-gray-700 w-8">{form.handoffScore}</span>
                    </div>
                  </div>
                  <Input label="Tempo máx. conversa (h)" type="number" value={form.maxConvHours} onChange={e => sf("maxConvHours", e.target.value)} min={1} max={168} />
                </div>
                <Textarea label="Mensagem de Handoff" rows={2} value={form.handoffMessage} onChange={e => sf("handoffMessage", e.target.value)}
                  placeholder="Ótimo! Vou te conectar com um corretor. Aguarde!" />
              </Section>
            )}

            {/* ── Cobrança info ── */}
            {form.type === "cobranca" && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                <strong>Campanha de Cobrança:</strong> Sem integração CRM e sem respostas automáticas por IA.
              </div>
            )}

            {/* ── Envio / Rate ── */}
            {form.type !== "inbound" && (
              <Section title="Envio & Velocidade">
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Delay entre msgs (ms)" type="number" value={form.delayMs} onChange={e => sf("delayMs", e.target.value)} min={500} max={60000} />
                  <Input label="Máx msgs/minuto" type="number" value={form.maxPerMinute} onChange={e => sf("maxPerMinute", e.target.value)} min={1} max={60} />
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
                  <strong>Anti-banimento:</strong> Recomendamos delay <strong>3000–7000ms</strong> e no máximo <strong>15–20 msgs/min</strong>.
                </div>
              </Section>
            )}

            {/* ── Follow-ups ── */}
            {form.type !== "inbound" && (
              <Section title="Follow-ups Automáticos">
                <div className="space-y-2">
                  {form.followUpDelays.map((delay, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-2.5">
                      <span className="text-xs font-semibold text-gray-500 min-w-[80px]">Follow-up {i + 1}</span>
                      <input type="number" value={delay} onChange={e => { const d = [...form.followUpDelays]; d[i] = e.target.value; sf("followUpDelays", d); }}
                        className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm" min={1} />
                      <span className="text-sm text-gray-500">horas</span>
                      <div className="flex-1" />
                      <button type="button" onClick={() => sf("followUpDelays", form.followUpDelays.filter((_, idx) => idx !== i))} className="text-xs text-gray-400 hover:text-red-500">remover</button>
                    </div>
                  ))}
                  {form.followUpDelays.length === 0 && <p className="text-xs text-gray-400">Nenhum follow-up configurado.</p>}
                </div>
                <button type="button" onClick={() => sf("followUpDelays", [...form.followUpDelays, "24"])}
                  className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition">
                  + Novo Follow-up
                </button>
                <p className="text-xs text-gray-400">A IA cria a mensagem de follow-up se o lead não responder no prazo.</p>
              </Section>
            )}

            {/* ── Contatos ── */}
            {form.type !== "inbound" && (
              <Section title="Contatos">
                {/* Manual numbers */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Adicionar Manualmente</label>
                  <div className="space-y-1.5 mb-2">
                    {form.manualNumbers.map((num, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                        <span className="text-sm text-gray-700 flex-1">{num}</span>
                        <button type="button" onClick={() => sf("manualNumbers", form.manualNumbers.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newNumber} onChange={e => setNewNumber(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (newNumber.trim()) { sf("manualNumbers", [...form.manualNumbers, newNumber.trim()]); setNewNumber(""); } } }}
                      placeholder="5511999999999" className="flex-1 border border-gray-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="button" onClick={() => { if (newNumber.trim()) { sf("manualNumbers", [...form.manualNumbers, newNumber.trim()]); setNewNumber(""); } }}
                      className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-medium transition">+</button>
                  </div>
                </div>

                {/* CSV upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Planilha <span className="font-normal text-gray-400">(CSV, XLS, XLSX)</span></label>
                  <div className={`border-2 border-dashed rounded-xl px-4 py-3 text-center transition ${csvFile ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"}`}>
                    <input ref={newCsvRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" id="campaign-csv" onChange={handleFileSelect} />
                    <label htmlFor="campaign-csv" className="cursor-pointer">
                      {csvFile ? <span className="text-sm text-blue-700 font-medium">📄 {csvFile.name}</span>
                        : <span className="text-sm text-gray-500">Clique para selecionar <span className="text-blue-600 underline">ou arraste aqui</span></span>}
                    </label>
                    {csvFile && <button type="button" onClick={() => { setCsvFile(null); setFileHeaders([]); setMappedData([]); if (newCsvRef.current) newCsvRef.current.value = ""; }} className="ml-3 text-xs text-red-500 hover:text-red-700">remover</button>}
                  </div>
                  {fileHeaders.length > 0 && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Mapear Colunas</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Coluna: Nome</label>
                          <select value={nameCol} onChange={e => setNameCol(e.target.value)} className="w-full border border-gray-300 rounded-lg text-sm px-2 py-1">
                            <option value="">(Ignorar)</option>
                            {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Coluna: Telefone *</label>
                          <select required value={phoneCol} onChange={e => setPhoneCol(e.target.value)} className="w-full border border-gray-300 rounded-lg text-sm px-2 py-1">
                            <option value="" disabled>Selecione...</option>
                            {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Use <strong>{`{nome}`}</strong> na mensagem para personalizar com o nome do contato.</p>
                </div>
              </Section>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-3 pt-1 pb-8">
              <button type="submit" disabled={submitting}
                className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition">
                {submitting && <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>}
                {submitting ? "Salvando..." : editingId ? "Salvar Alterações" : "Criar Campanha"}
              </button>
              <button type="button" onClick={() => { setStep("list"); setEditingId(null); resetFormState(); }} disabled={submitting}
                className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 disabled:opacity-50 transition">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
