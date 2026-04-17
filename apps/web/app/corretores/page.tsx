"use client";
import { useState, useEffect } from "react";
import { api } from "../lib/api";
import Badge from "../components/Badge";

interface Broker {
  id: string; name: string; phone: string;
  lastContact: string; status: string;
}

export default function CorretoresPage() {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false);

  useEffect(() => {
    api.get<Broker[]>("/brokers")
      .then(setBrokers)
      .catch(() => setApiError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Corretores</h1>
      <p className="text-sm text-gray-500 mb-6">Histórico de oportunidades e follow-ups realizados pela IA.</p>

      {loading ? (
        <p className="text-gray-400 text-sm">Carregando...</p>
      ) : apiError ? (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          ⚠️ API indisponível — verifique se o backend está rodando em <strong>localhost:3001</strong>.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Nome","Telefone","Último Contato","Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {brokers.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">{b.name}</td>
                  <td className="px-4 py-3 text-gray-500">{b.phone}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(b.lastContact).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-3"><Badge label={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
