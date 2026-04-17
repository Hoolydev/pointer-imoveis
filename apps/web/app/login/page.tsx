"use client";
import { useState, useEffect } from "react";

// Animated typing dots component
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block animate-bounce" style={{ animationDelay: "0ms", animationDuration: "0.9s" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block animate-bounce" style={{ animationDelay: "180ms", animationDuration: "0.9s" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block animate-bounce" style={{ animationDelay: "360ms", animationDuration: "0.9s" }} />
    </div>
  );
}

// Animated counter hook
function useCounter(target: number, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

// Animated progress bar
function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 400);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${width}%`, transition: "width 1.4s cubic-bezier(0.4,0,0.2,1)" }}
      />
    </div>
  );
}

// Chat messages with staggered entrance
const CHAT_MESSAGES = [
  { from: "ai",   text: "Olá! Vi que você tem interesse em imóveis na Zona Sul 🏡" },
  { from: "lead", text: "Sim! Quero apartamento, 2 quartos" },
  { from: "ai",   text: "Qual seu orçamento aproximado?" },
  { from: "lead", text: "Em torno de 400 mil" },
];

function ChatPreview() {
  const [visible, setVisible] = useState(0);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const sequence = async () => {
      for (let i = 0; i < CHAT_MESSAGES.length; i++) {
        await new Promise(r => setTimeout(r, 900 + i * 300));
        if (CHAT_MESSAGES[i].from === "ai") {
          setTyping(true);
          await new Promise(r => setTimeout(r, 800));
          setTyping(false);
        }
        setVisible(v => v + 1);
      }
      // restart loop
      await new Promise(r => setTimeout(r, 2500));
      setVisible(0);
      await new Promise(r => setTimeout(r, 400));
      sequence();
    };
    sequence();
  }, []);

  return (
    <div className="space-y-2 min-h-[120px]">
      {CHAT_MESSAGES.slice(0, visible).map((m, i) => (
        <div key={i} className={`flex ${m.from === "ai" ? "justify-end" : "justify-start"}`}>
          <div className={`text-xs rounded-2xl px-3 py-1.5 max-w-[85%] leading-relaxed ${
            m.from === "ai"
              ? "bg-blue-600 text-white rounded-tr-sm"
              : "bg-white border border-gray-200 text-gray-700 rounded-tl-sm shadow-sm"
          }`}>
            {m.text}
          </div>
        </div>
      ))}
      {typing && (
        <div className="flex justify-end">
          <div className="bg-blue-600/80 rounded-2xl rounded-tr-sm">
            <TypingDots />
          </div>
        </div>
      )}
    </div>
  );
}

// Floating notification card
function LeadNotification({ delay }: { delay: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    const t2 = setTimeout(() => setShow(false), delay + 3500);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [delay]);

  if (!show) return null;
  return (
    <div
      className="absolute top-4 right-4 bg-white rounded-xl shadow-lg px-4 py-3 flex items-center gap-3 border border-gray-100 z-20"
      style={{ animation: "slideIn 0.4s ease-out" }}
    >
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-sm shrink-0">✓</div>
      <div>
        <div className="text-xs font-semibold text-gray-800">Lead Qualificado!</div>
        <div className="text-xs text-gray-500">Score 87 · Pronto p/ corretor</div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notifCycle, setNotifCycle] = useState(0);

  const leadsHoje = useCounter(47);
  const qualificados = useCounter(18);
  const taxaResposta = useCounter(73);

  // Restart notification every 6s
  useEffect(() => {
    const t = setInterval(() => setNotifCycle(v => v + 1), 6000);
    return () => clearInterval(t);
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error("Senha incorreta. Tente novamente.");
      window.location.href = "/";
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          70%  { transform: scale(1);    box-shadow: 0 0 0 10px rgba(59,130,246,0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59,130,246,0); }
        }
        .animate-fade-up { animation: fadeUp 0.6s ease-out both; }
        .animate-pulse-ring { animation: pulse-ring 2s infinite; }
      `}</style>

      <div className="min-h-screen fixed inset-0 z-50 bg-white flex overflow-hidden">

        {/* ── LEFT: Login Form ── */}
        <div className="w-full lg:w-[42%] flex flex-col justify-between px-8 sm:px-14 py-10 relative">

          {/* Logo */}
          <div>
            <img src="https://www.pointerimoveis.net.br/assets/img/logos/logo.webp" alt="Pointer" className="h-9 w-auto object-contain" />
          </div>

          {/* Form block */}
          <div className="max-w-[360px] w-full mx-auto animate-fade-up">
            <h1 className="text-[28px] font-bold text-gray-900 leading-tight mb-1">
              Acessar Central de<br />Automação & IA
            </h1>
            <p className="text-sm text-gray-500 mb-8">
              Insira sua senha para acessar o painel.
            </p>

            <form onSubmit={handleLogin} className="space-y-4">

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Senha de Acesso</label>
                </div>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    autoFocus
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent pr-11 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                    tabIndex={-1}
                  >
                    {showPw ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className="text-sm text-red-700">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading && (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {loading ? "Entrando..." : "Entrar no Painel"}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-xs text-gray-400 text-center">
            Desenvolvido por: Alpha Builders Automações & IA
          </p>
        </div>

        {/* ── RIGHT: Animated Panel ── */}
        <div className="hidden lg:flex lg:w-[58%] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 relative overflow-hidden flex-col p-12">

          {/* Background blobs */}
          <div className="absolute -top-32 -right-32 w-72 h-72 bg-white/5 rounded-full pointer-events-none" />
          <div className="absolute bottom-0 -left-24 w-80 h-80 bg-indigo-900/40 rounded-full pointer-events-none" />
          <div className="absolute top-1/3 right-0 w-48 h-48 bg-blue-500/20 rounded-full pointer-events-none" />

          {/* Header text */}
          <div className="relative z-10 mb-8">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-3 py-1.5 mb-4">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-ring" />
              <span className="text-xs text-white/80 font-medium">IA Ativa · Processsando leads agora</span>
            </div>
            <h2 className="text-3xl font-bold text-white leading-tight mb-2">
              A Central de Automação<br />& IA para Imóveis
            </h2>
            <p className="text-blue-200 text-sm leading-relaxed max-w-md">
              Dispare campanhas no WhatsApp, deixe a IA qualificar cada lead e receba apenas os prontos para fechar negócio.
            </p>
          </div>

          {/* Main dashboard mock card */}
          <div className="relative z-10 flex-1 flex flex-col gap-4 justify-center">

            {/* Notification toast (animated) */}
            <LeadNotification key={notifCycle} delay={1200} />

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Leads Hoje", value: leadsHoje, suffix: "", icon: "👥", bg: "bg-blue-500/20", text: "text-white" },
                { label: "Qualificados", value: qualificados, suffix: "", icon: "⚡", bg: "bg-white/15", text: "text-white" },
                { label: "Taxa Resposta", value: taxaResposta, suffix: "%", icon: "📈", bg: "bg-indigo-500/25", text: "text-white" },
              ].map((s, i) => (
                <div key={i} className={`${s.bg} backdrop-blur-sm rounded-2xl p-4 border border-white/10`}>
                  <div className="text-lg mb-1">{s.icon}</div>
                  <div className={`text-2xl font-bold ${s.text}`}>{s.value}{s.suffix}</div>
                  <div className="text-xs text-blue-200 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Dashboard mock card */}
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* Card header */}
              <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs font-semibold text-gray-700">Central de Automação — Ao Vivo</span>
                </div>
                <div className="flex gap-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
              </div>

              <div className="p-5 grid grid-cols-2 gap-5">

                {/* Left: Campaigns */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Campanhas Ativas</div>
                  <div className="space-y-3">
                    {[
                      { name: "Reaquecimento Zona Sul", sent: 78, total: 120, color: "bg-purple-500" },
                      { name: "Lançamento Iguatemi", sent: 234, total: 250, color: "bg-blue-500" },
                      { name: "Cobrança Carteira", sent: 45, total: 60, color: "bg-amber-500" },
                    ].map((c, i) => (
                      <div key={i}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-700 truncate font-medium">{c.name}</span>
                          <span className="text-xs text-gray-400 ml-1 shrink-0">{Math.round((c.sent/c.total)*100)}%</span>
                        </div>
                        <ProgressBar pct={(c.sent / c.total) * 100} color={c.color} />
                      </div>
                    ))}
                  </div>

                  {/* Mini stats */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="bg-green-50 rounded-xl px-3 py-2.5 text-center">
                      <div className="text-lg font-bold text-green-600">94%</div>
                      <div className="text-xs text-green-700">Entrega</div>
                    </div>
                    <div className="bg-blue-50 rounded-xl px-3 py-2.5 text-center">
                      <div className="text-lg font-bold text-blue-600">3</div>
                      <div className="text-xs text-blue-700">Handoffs hoje</div>
                    </div>
                  </div>
                </div>

                {/* Right: AI Chat */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">IA Conversando</div>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs text-green-600">ao vivo</span>
                    </div>
                  </div>

                  {/* Lead info */}
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 mb-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      M
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-800">Marcos Oliveira</div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">Score:</span>
                        <div className="flex gap-0.5">
                          {[1,2,3,4].map(i => (
                            <div key={i} className="w-2.5 h-1.5 rounded-sm bg-blue-500" />
                          ))}
                          <div className="w-2.5 h-1.5 rounded-sm bg-gray-200" />
                        </div>
                        <span className="text-xs font-medium text-blue-600">82</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <ChatPreview />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Integrations footer */}
          <div className="relative z-10 mt-6 pt-5 border-t border-white/10">
            <p className="text-xs text-blue-300 mb-3">Integra com</p>
            <div className="flex items-center gap-5">
              {["WhatsApp", "OpenAI", "HauzApp CRM", "Uazapi"].map(name => (
                <span key={name} className="text-xs font-semibold text-white/50 hover:text-white/80 transition cursor-default">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
