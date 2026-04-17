# Pointer Imóveis — WhatsApp Automation System

Production-ready WhatsApp mass-messaging + AI lead-qualification SaaS built with Node.js, Next.js, Prisma, BullMQ and OpenAI.

---

## Architecture

```
apps/api      Express backend (Vercel serverless)
apps/web      Next.js 14 frontend (Vercel)
packages/db   Prisma schema + Neon PostgreSQL client
```

**Worker model:** BullMQ jobs are drained by a Vercel cron (`/api/cron/drain`, every minute). Inbound webhook events also fire a self-trigger for sub-second reply latency. No separate long-running process required.

---

## Quick Start

### 1. Install

```bash
pnpm install
```

### 2. Environment

```bash
cp .env.example apps/api/.env
# Fill in DATABASE_URL, REDIS_URL, OPENAI_API_KEY, UAZAPI_TOKEN, CRON_SECRET
```

### 3. Database

```bash
# Push schema to Neon (first time)
pnpm db:push

# Or run migrations
pnpm db:migrate

# Generate Prisma client
pnpm db:generate
```

### 4. Run locally

```bash
pnpm dev:api   # http://localhost:3001
pnpm dev:web   # http://localhost:3000
```

Simulate the cron drain locally:
```bash
curl -H "x-cron-secret: your-secret" http://localhost:3001/api/cron/drain
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `REDIS_URL` | ✅ | Upstash Redis (TLS) — `rediss://...` |
| `OPENAI_API_KEY` | ✅ | OpenAI API key |
| `LLM_MODEL` | — | Model override (default: `gpt-4o-mini`) |
| `WHATSAPP_PROVIDER` | — | `uazapi` \| `official` \| `mock` (default: `uazapi`) |
| `UAZAPI_BASE_URL` | — | Uazapi instance base URL |
| `UAZAPI_TOKEN` | — | Uazapi auth token |
| `WHATSAPP_OFFICIAL_TOKEN` | — | Meta Cloud API bearer token |
| `WHATSAPP_OFFICIAL_PHONE_ID` | — | Meta phone number ID |
| `WHATSAPP_OFFICIAL_VERIFY_TOKEN` | — | Webhook verification token |
| `CRON_SECRET` | ✅ | Secret header for `/api/cron/drain` |
| `PUBLIC_BASE_URL` | ✅ | Deployed API URL (for self-chain drain) |

---

## API Reference

### Campaigns
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/campaigns` | Create campaign (generates variations) |
| `GET` | `/campaigns` | List all campaigns |
| `GET` | `/campaigns/:id` | Campaign detail |
| `POST` | `/campaigns/:id/contacts` | Upload CSV (field: `file`) |
| `POST` | `/campaigns/:id/start` | Start / resume sending |
| `POST` | `/campaigns/:id/pause` | Pause campaign |
| `GET` | `/campaigns/:id/metrics` | Sent/failed/pending/reply rate |

**Create campaign body:**
```json
{
  "name": "Lançamento Janeiro",
  "baseMessage": "Olá! Vi que você tem interesse em veículos. Posso te ajudar?",
  "systemPrompt": "Você é um assistente de vendas de veículos. Qualifique o lead perguntando sobre modelo, orçamento e prazo.",
  "provider": "uazapi",
  "delayMs": 3000,
  "maxPerMinute": 20
}
```

### Leads
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/leads` | List (filters: `temperature`, `status`, `handoff`, `search`, `page`, `limit`) |
| `GET` | `/leads/:id` | Detail + full conversation |
| `POST` | `/leads/:id/handoff` | Toggle human handoff `{ "handoff": true }` |

### Webhooks
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/webhooks/uazapi` | Receive Uazapi inbound events |
| `POST` | `/webhooks/official` | Receive Meta Cloud API events |
| `GET` | `/webhooks/official` | Meta webhook verification challenge |

### Misc
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/stats` | Dashboard summary |
| `GET` | `/brokers` | Mock broker list |
| `POST` | `/brokers/:id/followup` | Trigger follow-up stub `{ "prompt": "..." }` |
| `GET` | `/api/cron/drain` | Drain BullMQ queues (cron / manual) |
| `GET` | `/health` | Health check |

---

## CSV Format

Upload contacts via `POST /campaigns/:id/contacts` with `multipart/form-data`, field name `file`.

Supported headers (case-insensitive):

```csv
name,phone
Carlos Lima,5511999990001
Ana Souza,5511999990002
```

Also accepts: `nome`, `telefone`, `numero`, `celular`.

---

## Message Variation Engine

On campaign creation, the AI generates **15–25 micro-variations** of your base message:

- Same meaning, same CTA, same offer
- Only swaps greetings, connectors, light synonyms
- Stored on `Campaign.variations` (JSON array)
- Distributed via **round-robin** across leads — NOT random

---

## AI Qualification Agent

Each inbound reply triggers the agent:

1. Loads last 20 messages (conversation memory)
2. Generates a reply using the campaign's `systemPrompt`
3. Extracts structured data:

```json
{
  "name": "Carlos",
  "interest": "SUV 0km",
  "budget": "R$ 150.000",
  "timeline": "próximo mês",
  "temperature": "warm",
  "score": 65
}
```

**Handoff triggers** (bot stops, lead flagged for human):
- `score >= 80` or `temperature === "hot"`
- Keywords: "falar com atendente", "me liga", "quero humano", etc.

---

## Deploying to Vercel

### API

```bash
cd apps/api
vercel --prod
```

Set all env vars in Vercel dashboard. The cron at `* * * * *` is defined in `apps/api/vercel.json`.

### Web

```bash
cd apps/web
vercel --prod
```

Set `NEXT_PUBLIC_API_URL` to your deployed API URL.

---

## WhatsApp Provider Setup

### Uazapi
1. Get your instance token from your Uazapi dashboard
2. Set `UAZAPI_BASE_URL` and `UAZAPI_TOKEN`
3. Point your Uazapi webhook to: `https://your-api.vercel.app/webhooks/uazapi`

### WhatsApp Official (Meta Cloud API)
1. Create a Meta App and configure a phone number
2. Set `WHATSAPP_OFFICIAL_TOKEN`, `WHATSAPP_OFFICIAL_PHONE_ID`, `WHATSAPP_OFFICIAL_VERIFY_TOKEN`
3. Point webhook to: `https://your-api.vercel.app/webhooks/official`

### Switching providers
Set `WHATSAPP_PROVIDER` env var to `uazapi`, `official`, or `mock`. Or specify per campaign in the `provider` field.

---

## Project Structure

```
.
├── apps/
│   ├── api/
│   │   ├── api/
│   │   │   ├── cron/drain.ts       # Vercel cron drain handler
│   │   │   └── index.ts            # Vercel function entry
│   │   ├── src/
│   │   │   ├── ai/
│   │   │   │   ├── agent.ts        # Qualification agent
│   │   │   │   ├── client.ts       # LLM abstraction (OpenAI default)
│   │   │   │   └── variation.ts    # Message variation engine
│   │   │   ├── lib/
│   │   │   │   ├── csv.ts          # CSV parser
│   │   │   │   ├── logger.ts       # Pino logger
│   │   │   │   ├── prisma.ts       # DB client
│   │   │   │   └── redis.ts        # IORedis client
│   │   │   ├── providers/
│   │   │   │   ├── uazapi.ts       # Uazapi provider
│   │   │   │   ├── official.ts     # Meta Cloud API provider
│   │   │   │   ├── mock.ts         # Mock provider (dev/tests)
│   │   │   │   └── index.ts        # getProvider() factory
│   │   │   ├── queues/
│   │   │   │   ├── index.ts        # Queue definitions
│   │   │   │   └── processors.ts   # Job processors
│   │   │   ├── routes/
│   │   │   │   ├── campaigns.ts
│   │   │   │   ├── leads.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   ├── stats.ts
│   │   │   │   └── brokers.ts
│   │   │   ├── services/
│   │   │   │   ├── campaign.service.ts
│   │   │   │   ├── lead.service.ts
│   │   │   │   └── inbound.service.ts
│   │   │   ├── app.ts              # Express app factory
│   │   │   └── server.ts           # Local dev entry
│   │   └── vercel.json
│   └── web/
│       └── app/
│           ├── campaigns/          # Campaign list + create + metrics
│           ├── leads/              # Lead list + conversation view
│           ├── corretores/         # Broker follow-up tab (mocked)
│           ├── components/         # Nav, Badge
│           └── lib/api.ts          # Typed fetch wrapper
└── packages/
    └── db/
        ├── prisma/schema.prisma    # Full schema
        └── index.ts                # Re-exports prisma client
```
