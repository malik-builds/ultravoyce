# Ultravoyce

Real-time voice agent platform. Build and run AI voice agents powered by node-based workflows — the caller speaks, the agent listens, reasons, and responds in real time.

## How it works

1. Caller connects via WebSocket from the browser
2. Audio streams to **ElevenLabs STT** (Scribe v2 Realtime) for live transcription
3. Transcript is fed to **OpenAI GPT-4o-mini** which advances the workflow
4. Response is streamed back via **ElevenLabs TTS** WebSocket
5. Session artifacts (transcript, trace, metadata) are written to disk

---

## Monorepo Structure

This is a [Turborepo](https://turbo.build/) monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces).

```
ultravoyce/
├── apps/
│   ├── voice/      ← Core voice agent runtime (Node.js, Express, WebSocket)
│   ├── builder/    ← Visual workflow builder (Next.js 16, React 19, Tailwind v4)
│   ├── phone/      ← Phone integration (in progress)
│   ├── docs/       ← Documentation site (Next.js)
│   └── web/        ← Marketing site (Next.js)
└── packages/
    ├── eslint-config/
    ├── typescript-config/
    └── ui/
```

---

## Apps

### `apps/voice` — Voice Agent Runtime

The backend that powers every call. Single Node.js ESM server with Express + WebSocket.

| Concern | Technology |
|---------|-----------|
| HTTP / API | Express 4 |
| WebSocket | `ws` library |
| STT | ElevenLabs Scribe v2 Realtime |
| LLM | OpenAI `gpt-4o-mini` |
| TTS | ElevenLabs TTS WebSocket streaming |
| Frontend UI | Vanilla JS + Three.js (bundled, no build step) |

**Workflow node types:**

| Node | Description |
|------|-------------|
| `tell` | Speak a message and advance |
| `ask_question` | Ask one question, store the answer in a variable |
| `get_details` | Collect multiple fields via LLM extraction |
| `answer_queries` | Free-form Q&A against a knowledge base |
| `switch` | LLM-based branching across multiple cases |
| `action` | POST to a webhook / n8n endpoint |
| `calendar_booker` | Book a cal.com slot |
| `transfer_call` | Play a hold message and transfer |

**Session artifacts** (written to `recordings/<sessionId>/`):
- `transcript.txt` — turn-by-turn conversation
- `workflow_trace.json` — full node execution trace with timestamps
- `metadata.json` — session stats

**API routes:**
- `GET /health` — health + config check
- `GET /sessions` — list recorded sessions
- `GET/POST /workflows` — list and fetch workflow definitions

---

### `apps/builder` — Workflow Builder UI

Visual drag-and-drop editor for creating and editing voice agent workflows.

| Concern | Technology |
|---------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Node editor | `@xyflow/react` (React Flow) |
| State | Zustand |
| Data fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Auth + DB | Supabase (`@supabase/ssr`) |
| Language | TypeScript |

---

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm 9.15.9

### Install dependencies

```sh
pnpm install
```

### Environment variables

Create `apps/voice/.env` from the example:

```sh
cp apps/voice/.env.example apps/voice/.env
```

Required:

```env
OPENAI_API_KEY=
ELEVENLABS_API_KEY=
```

Optional:

```env
ELEVENLABS_VOICE_ID=        # default: Xb7hH8MSUJpSbSDYk0k2
ELEVENLABS_TTS_MODEL=       # default: eleven_flash_v2_5
WORKFLOW_PATH=              # default: workflows/default.json
AUTO_HANGUP_MS=             # default: 30000
CAL_COM_API_KEY=            # required for calendar_booker nodes
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

### Run the voice server

```sh
# From the repo root
pnpm dev --filter voice

# Or directly
cd apps/voice
node server.js
```

Open `http://localhost:8001` to use the call UI.

### Run the workflow builder

```sh
pnpm dev --filter builder
```

Open `http://localhost:3000`.

### Run everything

```sh
pnpm dev
```

---

## Workflows

Workflows are JSON files that define the conversation flow as a graph of nodes. Load a workflow by setting `WORKFLOW_PATH`, or `POST` one via the `/workflows` API.

Nodes support template variable interpolation with `{{ varName }}` and `{{ secrets.KEY }}` syntax.

Example workflows are in `apps/voice/workflows/`.

---

## Deployment

A `Dockerfile` is included at the repo root for Railway or any container platform.

```sh
docker build -t ultravoyce .
docker run -p 8001:8001 --env-file apps/voice/.env ultravoyce
```

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm workspaces |
| Voice runtime | Node.js ESM, Express 4, `ws` |
| STT | ElevenLabs Scribe v2 Realtime |
| LLM | OpenAI GPT-4o-mini |
| TTS | ElevenLabs streaming WebSocket |
| Builder | Next.js 16, React 19, Tailwind v4 |
| Node editor | React Flow (`@xyflow/react`) |
| Auth + DB | Supabase |
| State | Zustand |
| Validation | Zod + React Hook Form |
| Language | JavaScript (voice) + TypeScript (builder) |
