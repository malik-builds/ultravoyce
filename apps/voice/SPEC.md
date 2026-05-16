# Voice Backend — Specification

This document describes the complete behaviour of the Ultravoyce voice backend (`apps/voice`). It covers the HTTP API, WebSocket protocol, workflow execution model, node types, session lifecycle, and external service integrations.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration](#configuration)
4. [HTTP API](#http-api)
5. [WebSocket Protocol](#websocket-protocol)
   - [Client → Server messages](#client--server-messages)
   - [Server → Client messages](#server--client-messages)
6. [Workflow Schema](#workflow-schema)
7. [Node Types](#node-types)
8. [Execution Model](#execution-model)
9. [Session Lifecycle](#session-lifecycle)
10. [Session Artifacts](#session-artifacts)
11. [External Services](#external-services)
12. [Security](#security)

---

## Overview

The voice backend is a Node.js server that powers real-time AI voice conversations driven by a node-based workflow definition. It:

- Receives live microphone audio from a browser over WebSocket
- Transcribes speech in real time using ElevenLabs STT
- Executes a workflow, node by node, using the transcript as input
- Generates natural language responses using OpenAI
- Speaks those responses back using ElevenLabs TTS, streamed as MP3 chunks to the browser

The workflow controls the entire conversation: what the agent says, what data it collects, when it calls external systems, and when the call ends.

---

## Architecture

```
Browser
  │  WebSocket /ws (audio chunks + control messages)
  ▼
server.js  ──────────────────────────────────────────────────────────
  │  connectSTT()         services/stt.js  →  ElevenLabs STT WS
  │  handleUserInput()    workflow/runtime.js
  │    └─ node handler    workflow/nodes/<type>.js
  │         ├─ extractFields / classifyIntent / answerQuery
  │         │              services/llm.js  →  OpenAI
  │         └─ speak()    services/tts.js  →  ElevenLabs TTS WS
  │                            └─ audio chunks → browser
  │
  ├── HTTP routes          routes/
  │   ├── GET  /health
  │   ├── POST /workflow
  │   ├── GET  /workflow
  │   └── GET  /sessions/:id
  │
  └── Session state        workflow/session.js
        └── Artifacts      storage/artifacts.js → recordings/<uuid>/
```

All turns within a session are serialised through `session.queue` (a chained Promise). This guarantees that STT callbacks, node execution, and TTS never interleave concurrently within the same session.

---

## Configuration

All values are read from environment variables. See `.env.example` for the full list.

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENAI_API_KEY` | yes | — | OpenAI API key |
| `ELEVENLABS_API_KEY` | yes | — | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | no | `Xb7hH8MSUJpSbSDYk0k2` | TTS voice |
| `ELEVENLABS_TTS_MODEL` | no | `eleven_flash_v2_5` | TTS model |
| `OPENAI_TEXT_MODEL` | no | `gpt-4o-mini` | LLM model for all reasoning |
| `WORKFLOW_PATH` | no | `workflows/default.json` | Local workflow file path |
| `WORKFLOW_ID` | no | — | If set, load workflow from Supabase instead of file |
| `SUPABASE_URL` | if `WORKFLOW_ID` set | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | if `WORKFLOW_ID` set | — | Bypasses RLS for server-side reads |
| `CAL_COM_API_KEY` | if calendar nodes used | — | cal.com API key |
| `AUTO_HANGUP_MS` | no | `30000` | Inactivity timeout before auto-hangup |
| `TTS_TIMEOUT_MS` | no | `15000` | Max time to wait for TTS stream to complete |
| `MAX_RECORDING_BYTES` | no | `15728640` (15 MB) | Max raw audio bytes stored per session |
| `ALLOW_LOCAL_WEBHOOKS` | no | `false` | Allow `http://` and private-IP webhook URLs |
| `PORT` | no | `8001` | HTTP listen port |

**Workflow loading priority:** If `WORKFLOW_ID` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are all set, the workflow is fetched from Supabase. Otherwise the local file at `WORKFLOW_PATH` is used.

**Runtime hot-swap:** A workflow can be replaced at runtime without restarting the server via `POST /workflow`. Active sessions are not affected; the new workflow applies to all new sessions.

---

## HTTP API

### `GET /health`

Returns server readiness.

**Response**
```json
{ "ok": true, "workflowLoaded": true }
```

---

### `POST /workflow`

Replaces the active workflow definition in memory. Used by the drag-and-drop builder to push a new workflow to the runtime.

**Request body** — either of these shapes is accepted:
```json
{ "workflow": { "id": "wf_...", "nodes": [...], "entryNodeId": "..." } }
```
```json
{ "id": "wf_...", "nodes": [...], "entryNodeId": "..." }
```

**Response**
```json
{ "ok": true, "workflowId": "wf_..." }
```

**Error** (400)
```json
{ "ok": false, "error": "Invalid workflow: missing nodes or entryNodeId" }
```

---

### `GET /workflow`

Returns the currently loaded workflow definition.

**Response**
```json
{ "ok": true, "workflow": { "id": "...", "nodes": [...], ... } }
```

---

### `GET /sessions/:sessionId`

Returns saved artifacts for a completed session.

**Path param:** `sessionId` — UUID of the session.

**Response**
```json
{
  "ok": true,
  "sessionId": "3fa85f64-...",
  "transcript": "user: Hi there\nassistant: Hello! ...",
  "collectedData": "customerName: Malik\ncustomerEmail: malik@example.com",
  "metadata": {
    "sessionId": "3fa85f64-...",
    "workflowId": "wf_...",
    "createdAt": "2026-05-16T14:00:00.000Z",
    "endedAt": "2026-05-16T14:03:22.000Z",
    "reason": "user_ended",
    "audioChunksReceived": 142,
    "turns": 6
  }
}
```

**Error** (404) if the session does not exist.

---

## WebSocket Protocol

Endpoint: `ws://<host>/ws`

All messages are JSON-encoded text frames (never binary).

### Client → Server messages

#### `audio.chunk`
Sent continuously while the user is speaking. Audio is PCM 16-bit, mono, 24 kHz, encoded as base64.

```json
{ "type": "audio.chunk", "audio": "<base64 PCM>" }
```

#### `call.end`
User clicks "End Call".

```json
{ "type": "call.end" }
```

#### `call.decline`
User declines before the call starts.

```json
{ "type": "call.decline" }
```

---

### Server → Client messages

#### Session

| Type | Payload | When |
|---|---|---|
| `session.started` | `{ sessionId }` | Connection accepted, session created |
| `call.state` | `{ state: "connected" }` | Immediately after session start |
| `workflow.started` | `{ workflowId }` | Workflow loaded for this session |
| `stt.ready` | — | ElevenLabs STT connection open, safe to start sending audio |
| `call.auto_hangup` | — | Server-side inactivity timeout reached |

#### Transcription

| Type | Payload | When |
|---|---|---|
| `transcript.partial` | `{ text }` | In-progress speech, updates frequently |
| `transcript.final` | `{ role: "user", text }` | Utterance committed by STT VAD |

#### Assistant speech

| Type | Payload | When |
|---|---|---|
| `assistant.final` | `{ text }` | Full response text before TTS starts |
| `assistant.speaking` | — | TTS stream about to begin |
| `assistant.audio.chunk` | `{ audio: "<base64 MP3>", mimeType: "audio/mpeg" }` | Streamed MP3 chunk |
| `assistant.speaking.done` | — | TTS stream finished |

#### Workflow state

| Type | Payload | When |
|---|---|---|
| `workflow.state` | `{ nodeId, nodeType, nodeLabel, pendingRequired, variables }` | After every node transition |
| `workflow.node.entered` | `{ nodeId, nodeType }` | Before a node executes |
| `workflow.node.waiting` | `{ nodeId }` | Node is waiting for user input |
| `workflow.node.exited` | `{ nodeId, nextNodeId }` | After a node completes |
| `workflow.completed` | — | Workflow reached a node with `nextNodeId: null` |
| `workflow.user.turn` | `{ nodeId, text }` | User utterance processed by a node |
| `workflow.variable.updated` | `{ variable, value }` | A global variable was written |
| `workflow.switch.decision` | `{ nodeId, selectedCase, nextNodeId }` | Switch node resolved a branch |
| `workflow.action.result` | `{ nodeId, ok, message }` | Webhook call completed |
| `workflow.calendar.result` | `{ nodeId, ok, message }` | cal.com booking completed |
| `workflow.transfer.requested` | `{ transferTo }` | Transfer call node triggered |

#### Errors

| Type | Payload | When |
|---|---|---|
| `error` | `{ message }` | Any server-side error |

---

## Workflow Schema

A workflow is a JSON document that defines the conversation flow.

```jsonc
{
  "workflow": {
    "id": "wf_example_01",           // unique identifier
    "name": "Booking Agent",          // display name
    "version": 1,
    "description": "...",
    "trigger": {
      "type": "inbound_websocket",
      "config": { "connectorId": "conn_abc123" }
    },
    "globalVariables": {              // variables shared across all nodes
      "customerName":  { "type": "string",  "value": null },
      "bookingConfirmed": { "type": "boolean", "value": false }
    },
    "entryNodeId": "node_tell_01",    // first node to execute
    "nodes": [ ... ]
  }
}
```

### Global variables

- Declared once at the top level with a `type` (`string`, `number`, `boolean`) and initial `value`
- All nodes can read and write them
- Referenced in any config string with `{{ variableName }}`
- Secrets (API keys, env vars) are referenced with `{{ secrets.ENV_VAR_NAME }}`
- The runtime substitutes current values before passing strings to LLM or external APIs

### Node common fields

Every node has:

```jsonc
{
  "id": "node_tell_01",        // unique within workflow
  "type": "tell",              // determines handler
  "label": "Greet caller",     // shown in builder UI
  "position": { "x": 300, "y": 60 },  // canvas coordinates
  "nextNodeId": "node_ask_01", // null = end of workflow
  "config": { ... }            // type-specific config
}
```

---

## Node Types

### `tell`

Speaks a message and immediately moves on. No user input expected.

```json
"config": {
  "message": "Hello! How can I help you today?"
}
```

---

### `ask_question`

Asks a single question, waits for the user's response, stores it in a variable, then advances.

```json
"config": {
  "question": "What is your full name?",
  "storeIn": "customerName",
  "variableType": "string"
}
```

`variableType` is `string` (default), `number`, or `boolean`. If the response cannot be parsed to the expected type, the question is repeated.

Boolean parsing: `yes / y / true / confirm / confirmed` → `true`, `no / n / false / cancel` → `false`.

---

### `get_details`

Collects multiple fields through natural conversation. The agent asks for one field at a time, extracts values from speech using GPT with full conversation history as context, and stays on this node until all `required` fields are filled.

```json
"config": {
  "prompt": "Collect the caller's contact details.",
  "fields": [
    {
      "variable": "customerName",
      "description": "The caller's full name",
      "type": "string",
      "required": true,
      "question": "Could I get your full name?"
    },
    {
      "variable": "customerEmail",
      "description": "The caller's email address",
      "type": "string",
      "required": true
    }
  ]
}
```

If `question` is omitted, the agent generates one from `description`: `"Could I get your <description>?"`.

Field-level validation:
- Fields containing `email` in their variable name or description are validated against an email regex
- Fields containing `phone` are validated against a basic phone number pattern
- Invalid values are not stored; the agent asks again

---

### `answer_queries`

Answers free-form caller questions using a knowledge base string. Stays active for up to `maxTurns` exchanges, then advances.

```json
"config": {
  "knowledgeBase": "Acme Corp provides plumbing, electrical, and HVAC services...",
  "fallbackMessage": "I don't have that information. Would you like to be transferred?",
  "maxTurns": 6
}
```

If the LLM cannot find an answer in the knowledge base, it speaks `fallbackMessage` instead.

---

### `switch`

Classifies the user's next utterance into one of a set of defined cases using GPT, then routes to the matching node. This is the primary branching mechanism.

```json
"config": {
  "prompt": "Classify the caller's intent.",
  "entryMessage": "How can I help you today?",
  "cases": [
    { "value": "booking",  "label": "Wants to book an appointment", "nextNodeId": "node_getdetails_01" },
    { "value": "query",    "label": "Has a general question",       "nextNodeId": "node_query_01" },
    { "value": "transfer", "label": "Wants to speak to a human",    "nextNodeId": "node_transfer_01" }
  ],
  "defaultCaseNextNodeId": "node_query_01"
}
```

`entryMessage` is optional. If set, the agent speaks it before waiting for input.

The top-level `nextNodeId` on a switch node must be `null`. Routing is handled entirely within `config.cases`.

If no case matches and no `defaultCaseNextNodeId` is set, the agent asks the caller to rephrase.

---

### `action`

Fires an HTTP webhook (e.g. n8n) with interpolated payload variables. Does not wait for user input.

```json
"config": {
  "webhookUrl": "https://n8n.acmecorp.com/webhook/crm-intake",
  "method": "POST",
  "payload": {
    "name":  "{{ customerName }}",
    "email": "{{ customerEmail }}"
  },
  "onSuccess": "continue",
  "onFailure": "continue"
}
```

`onFailure: "stop"` ends the workflow if the webhook call fails. `onFailure: "continue"` moves on regardless.

Security: By default, only `https://` URLs with public IP addresses are permitted. Set `ALLOW_LOCAL_WEBHOOKS=true` to allow `http://` and private IP addresses during development.

---

### `calendar_booker`

Fetches real available slots from cal.com for the next 7 days, books the first available slot, and stores the booking result in global variables.

```json
"config": {
  "calComEventTypeId": 42,
  "calComApiKey": "{{ secrets.CAL_COM_API_KEY }}",
  "timezone": "Asia/Colombo",
  "attendeeNameVariable": "customerName",
  "attendeeEmailVariable": "customerEmail",
  "bookingIdVariable": "bookingId",
  "bookingTimeVariable": "bookingTime",
  "bookingConfirmationVariable": "bookingConfirmed",
  "confirmationMessage": "Done {{ customerName }}, you're booked for {{ bookingTime }}.",
  "onFailure": "continue"
}
```

Requires `attendeeEmailVariable` to be filled before execution. On success, sets `bookingIdVariable`, `bookingTimeVariable`, and `bookingConfirmationVariable` (to `true`). On failure, speaks an error and respects `onFailure`.

---

### `transfer_call`

Speaks a hold message, emits a `workflow.transfer.requested` event to the client, then advances.

```json
"config": {
  "message": "Please hold while I connect you with a team member.",
  "transferTo": "+94112345678",
  "transferType": "cold"
}
```

Actual call transfer is handled by the client or a telephony connector — the backend only signals the intent.

---

## Execution Model

```
bootstrap
  └── loadWorkflow (file or Supabase)

client connects → WebSocket /ws
  └── createSession()
  └── connectSTT()
  └── stt: session_started
        └── processUntilInput()           ← starts from entryNodeId

          ┌── getNode(currentNodeId)
          │   getHandler(node.type).enter(ctx)
          │
          │   result.waitForInput = false  →  currentNodeId = nextNodeId
          │   result.waitForInput = true   →  PAUSE (await STT)
          └──
              │
              STT: committed_transcript
              │  (skipped if isSpeaking)
              └── handleUserInput(utterance)
                    └── getHandler(node.type).handleInput(ctx, utterance)
                          result.waitForInput = false  →  advance + processUntilInput()
                          result.waitForInput = true   →  PAUSE again

          currentNodeId = null  →  workflow.completed
```

Key invariants:
- All session operations are serialised through `session.queue` — no concurrent turns
- If `session.isSpeaking` is true when a transcript arrives, the utterance is **discarded** (barge-in prevention)
- The safety counter `MAX_NODE_VISITS = 60` prevents infinite loops in malformed workflows

---

## Session Lifecycle

```
CONNECTING
  WebSocket upgrade accepted
  createSession() — allocates UUID, directories, audio stream, variable state

STARTING
  STT WebSocket connected
  processUntilInput() queued

ACTIVE
  STT streams partial_transcript events
  On committed_transcript: handleUserInput() → node handler → TTS

AUTO-HANGUP
  If no audio for AUTO_HANGUP_MS and agent is not speaking → close WebSocket
  Timer resets on every audio.chunk message

CLOSING
  ws.close() received (user, auto-hangup, or size limit)
  finalizeSession() → writes artifacts → closes STT socket and audio stream
```

### Session state object

| Field | Type | Description |
|---|---|---|
| `sessionId` | string | UUID |
| `currentNodeId` | string \| null | Active node in the workflow |
| `variables` | object | Live copy of globalVariables |
| `turns` | string[] | `"role: text"` log |
| `turnObjects` | object[] | Structured turn log with timestamps and nodeId |
| `isSpeaking` | boolean | True while TTS is streaming |
| `awaitingInput` | boolean | True when current node needs user speech |
| `answerTurns` | number | Turn counter for `answer_queries` nodes |
| `queue` | Promise | Serialisation chain for all async operations |
| `closed` | boolean | True after finalizeSession() |

---

## Session Artifacts

Written to `recordings/<sessionId>/` when a session ends.

| File | Contents |
|---|---|
| `transcript.txt` | Full conversation, one turn per line (`user: ...` / `assistant: ...`) |
| `collected_data.txt` | All non-null global variable values (`variableName: value`) |
| `workflow_trace.json` | Array of turn objects with role, text, timestamp, and nodeId |
| `metadata.json` | Session stats: sessionId, workflowId, start/end times, reason, turn count |
| `audio.pcm` | Raw PCM audio received from the browser (16-bit, mono, 24 kHz) |

---

## External Services

### ElevenLabs STT

- **Endpoint:** `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
- **Model:** `scribe_v2_realtime`
- **Audio format:** PCM 16-bit mono 24 kHz, base64-encoded, sent as JSON `input_audio_chunk` messages
- **Commit strategy:** `vad` — the service decides when an utterance is complete based on silence detection
- **Events received:** `session_started`, `partial_transcript`, `committed_transcript`

### ElevenLabs TTS

- **Endpoint:** `wss://api.elevenlabs.io/v1/text-to-speech/<voiceId>/stream-input`
- **Model:** configurable via `ELEVENLABS_TTS_MODEL`
- **Streaming:** text is sent in chunks of ≤90 characters or at sentence boundaries
- **Output:** base64-encoded MP3 chunks, forwarded to the browser as `assistant.audio.chunk` messages
- **Timeout:** `TTS_TIMEOUT_MS` (default 15 s) — rejects if stream does not complete in time

### OpenAI

All LLM calls use `response_format: { type: "json_object" }` where structured output is needed. Conversation history (up to the last 10 turns) is passed for context.

| Function | Used by | Description |
|---|---|---|
| `extractFields` | `get_details` | Extracts named variable values from speech |
| `classifyIntent` | `switch` | Classifies utterance into a named case |
| `answerQuery` | `answer_queries` | Answers a question from a knowledge base string |

### cal.com

- **Slots endpoint:** `GET https://api.cal.com/v1/slots/available`
- **Booking endpoint:** `POST https://api.cal.com/v1/bookings`
- Searches the next 7 days and books the first available slot
- API key is passed per-node in `config.calComApiKey` using `{{ secrets.CAL_COM_API_KEY }}`

---

## Security

| Control | Detail |
|---|---|
| Webhook URL validation | Only `https://` with public IPs permitted by default. `ALLOW_LOCAL_WEBHOOKS=true` disables this for development. |
| WebSocket path restriction | Only connections to `/ws` are upgraded; all others are destroyed. |
| Recording size cap | Audio stream capped at `MAX_RECORDING_BYTES`. Connection closed if exceeded. |
| Session ID validation | `GET /sessions/:id` rejects any ID that does not match UUID format. |
| Node visit limit | `MAX_NODE_VISITS = 60` per `processUntilInput()` call prevents runaway loops. |
| Secret interpolation | `{{ secrets.KEY }}` reads from `process.env`, never from workflow JSON. |
| Supabase access | Uses service role key (server-side only). Never exposed to the browser. |
