import { api } from "../../lib/api";
import Badge from "../../components/Badge";

interface Metrics {
  total: number; sent: number; failed: number; pending: number;
  replies: number; replyRate: number;
}
interface Campaign { id: string; name: string; status: string; provider: string; baseMessage: string; }

async function getData(id: string) {
  try {
    const [campaign, metrics] = await Promise.all([
      api.get<Campaign>(`/campaigns/${id}`),
      api.get<Metrics>(`/campaigns/${id}/metrics`),
    ]);
    return { campaign, metrics };
  } catch { return null; }
}

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const data = await getData(params.id);
  if (!data) return <p className="text-gray-400">Campanha não encontrada.</p>;
  const { campaign, metrics } = data;

  const bars = [
    { label: "Enviados", value: metrics.sent, color: "bg-green-500", total: metrics.total },
    { label: "Falhas", value: metrics.failed, color: "bg-red-400", total: metrics.total },
    { label: "Pendentes", value: metrics.pending, color: "bg-yellow-400", total: metrics.total },
    { label: "Respostas", value: metrics.replies, color: "bg-blue-500", total: metrics.sent || 1 },
  ];

  return (
    <div>
      <a href="/campaigns" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">← Campanhas</a>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{campaign.name}</h1>
        <Badge label={campaign.status} />
        <span className="text-sm text-gray-400">{campaign.provider}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Contatos", value: metrics.total },
          { label: "Enviados", value: metrics.sent },
          { label: "Falhas", value: metrics.failed },
          { label: "Taxa de Resposta", value: `${metrics.replyRate}%` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-6">
        <h2 className="font-semibold mb-4">Progresso</h2>
        <div className="space-y-3">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">{b.label}</span>
                <span className="font-medium">{b.value}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-2 rounded-full ${b.color}`}
                  style={{ width: `${Math.min(100, b.total > 0 ? (b.value / b.total) * 100 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h2 className="font-semibold mb-2">Mensagem Base</h2>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{campaign.baseMessage}</p>
      </div>
    </div>
  );
}
