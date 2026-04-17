"use client";
import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface Settings {
  openai_api_key?: string;
  llm_model?: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    api.get<Settings>("/settings")
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  function set(key: keyof Settings, value: string) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      notify("✅ Configurações salvas com sucesso!");
    } catch {
      notify("❌ Erro ao salvar. Verifique se a API está rodando.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-400 text-sm">Carregando...</p>;

  return (
    <div className="max-w-2xl">
      {toast && (
        <div className="fixed top-4 right-4 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold mb-1">Configurações</h1>
      <p className="text-sm text-gray-500 mb-8">Credenciais globais de IA — as credenciais de WhatsApp são configuradas por campanha.</p>

      <form onSubmit={handleSave} className="space-y-6">

        {/* IA */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Inteligência Artificial</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OpenAI API Key</label>
            <input
              type="password"
              value={settings.openai_api_key ?? ""}
              onChange={(e) => set("openai_api_key", e.target.value)}
              placeholder="sk-..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
            <select
              value={settings.llm_model ?? "gpt-4o-mini"}
              onChange={(e) => set("llm_model", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="gpt-4o-mini">gpt-4o-mini (oficial)</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              <option value="gpt-5.1-mini">gpt-5.1-mini</option>
              <option value="o1-mini">o1-mini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {saving ? "Salvando..." : "Salvar Configurações"}
        </button>
      </form>
    </div>
  );
}
