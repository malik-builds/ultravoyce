# Ultravoyce Voice App

Express + WebSocket realtime voice assistant with workflow-node execution:

- Browser streams live PCM mic audio to backend over WebSocket.
- ElevenLabs realtime STT provides partial/final transcripts.
- Runtime executes nodes from a workflow loaded from Supabase (`workflows` table).
- The workflow must be **deployed** in the builder (`deployments.deployed = true`) before a call can start.
- OpenAI is used for extraction, branching, and knowledge responses.
- ElevenLabs streams TTS audio back to the browser for conversational speed.
- User can end call manually with "Decline Call"; fallback auto-hangup is enabled.
- Server saves transcript, metadata, and workflow trace locally:
  - `recordings/<sessionId>/transcript.txt`
  - `recordings/<sessionId>/metadata.json`
  - `recordings/<sessionId>/workflow_trace.json`

## Setup

```bash
cd apps/voice
npm install
cp .env.example .env
```

Set your env values:

- `SUPABASE_URL` (required)
- `SUPABASE_SECRET_KEY` (required — service role key for server-side reads)
- `OPENAI_API_KEY` (required)
- `ELEVENLABS_API_KEY` (required)

## Run

```bash
cd apps/voice
npm run dev
```

Open [http://localhost:8001](http://localhost:8001) and pick a deployed workflow from the list.

List deployed workflows: `GET /workflows/deployed`

WebSocket endpoint: `ws://localhost:8001/ws?workflowId=YOUR-WORKFLOW-UUID`

If the workflow is not deployed, the server responds with HTTP **400** and `{ "error": "The workflow has not been deployed" }`.

## Workflow editing

Create and edit workflows in the builder app (`apps/builder`). Deploy a workflow from the workflows list before testing voice calls.
