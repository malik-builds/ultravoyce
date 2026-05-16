# Ultravoyce Voice App

Express + WebSocket realtime voice assistant with workflow-node execution:

- Browser streams live PCM mic audio to backend over WebSocket.
- ElevenLabs realtime STT provides partial/final transcripts.
- Runtime executes nodes from a workflow JSON (`workflows/default.json`).
- Required fields in `get_details` are enforced before node progression.
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

- `OPENAI_API_KEY` (required)
- `ELEVENLABS_API_KEY` (required)

## Run

```bash
cd apps/voice
npm run dev
```

Open [http://localhost:8001](http://localhost:8001).

## Workflow editing (phase 1)

Update [`workflows/default.json`](workflows/default.json) to change:

- node order (`nextNodeId`)
- required fields in `get_details`
- messages and switch branches

The runtime emits live `workflow.state` so you can verify node entry and mandatory-field completion during calls.
