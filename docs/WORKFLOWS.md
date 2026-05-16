# Workflow schema

A workflow is a JSON document that describes the flow of a voice agent conversation — the nodes it moves through, the variables it tracks, and the logic that decides what happens next.

Workflows are stored in a database, rendered on a canvas for editing, and executed by the backend runtime when an inbound call arrives.

---

## Top-level structure

```json
{
  "workflow": {
    "id": "wf_receptionist_01",
    "name": "Receptionist Agent",
    "version": 1,
    "description": "...",
    "createdAt": "2026-05-16T08:00:00Z",
    "updatedAt": "2026-05-16T08:00:00Z",
    "trigger": { ... },
    "globalVariables": { ... },
    "entryNodeId": "node_tell_01",
    "nodes": [ ... ]
  }
}
```

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique workflow identifier |
| `name` | string | Human-readable name shown in the UI |
| `version` | integer | Incremented on every save |
| `description` | string | Optional summary of what this workflow does |
| `createdAt` | ISO 8601 | Creation timestamp |
| `updatedAt` | ISO 8601 | Last modified timestamp |
| `trigger` | object | What starts this workflow — see [Trigger](#trigger) |
| `globalVariables` | object | Variables shared across all nodes — see [Global variables](#global-variables) |
| `entryNodeId` | string | The `id` of the first node the runtime should execute |
| `nodes` | array | All nodes in the workflow — see [Nodes](#nodes) |

---

## Trigger

Defines what causes the workflow to start. Currently only one trigger type is supported.

```json
"trigger": {
  "type": "inbound_websocket",
  "config": {
    "connectorId": "conn_abc123"
  }
}
```

| Field | Type | Description |
|---|---|---|
| `type` | string | Always `"inbound_websocket"` for now |
| `config.connectorId` | string | The connector microservice instance that feeds calls into this workflow |

---

## Global variables

A flat map of variables that persist across the entire conversation. All nodes can read from and write to this object. Variable values start as `null` and are populated as the conversation progresses.

```json
"globalVariables": {
  "customerName":   { "type": "string",  "value": null },
  "bookingConfirmed": { "type": "boolean", "value": false }
}
```

Each entry is keyed by the variable name and has two fields:

| Field | Type | Description |
|---|---|---|
| `type` | string | `"string"`, `"boolean"`, or `"number"` |
| `value` | any | Initial value; `null` means not yet collected |

Variables are referenced anywhere in node config strings using `{{ variableName }}` syntax. The runtime substitutes the current value before passing text to the LLM or making API calls.

---

## Nodes

Nodes are the building blocks of a workflow. They live in the `nodes` array and are linked to each other via `nextNodeId`. The runtime starts at `entryNodeId` and follows the chain until it reaches a node where `nextNodeId` is `null`.

Every node shares a common set of top-level fields:

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier for this node within the workflow |
| `type` | string | Determines the node's behaviour — see node types below |
| `label` | string | Human-readable name shown on the canvas |
| `position` | object | `{ "x": number, "y": number }` — canvas coordinates for rendering |
| `nextNodeId` | string \| null | The `id` of the next node to execute; `null` ends the workflow |
| `config` | object | Node-specific configuration — varies by type |

### Routing rules

- **Linear nodes** (`tell`, `ask_question`, `get_details`, `calendar_booker`, `answer_queries`, `action`, `transfer_call`) use the top-level `nextNodeId` to move forward. Setting `nextNodeId: null` on any of these ends the workflow.
- **Branching nodes** (`switch`) set `nextNodeId: null` at the top level and resolve routing entirely within `config`. Each case must eventually lead to a node whose `nextNodeId` is `null`.

There is no explicit end node type. A workflow ends naturally when the runtime encounters any node whose `nextNodeId` is `null`.

---

## Node types

### Tell

Speaks a message to the caller and immediately moves on. No input is expected.

```json
{
  "id": "node_tell_01",
  "type": "tell",
  "label": "Greet caller",
  "position": { "x": 300, "y": 60 },
  "nextNodeId": "node_ask_01",
  "config": {
    "message": "Hello! Thank you for calling Acme Corp."
  }
}
```

| Config field | Type | Description |
|---|---|---|
| `message` | string | Text to speak; supports `{{ variable }}` interpolation |

---

### Ask question

Asks the caller a single question, waits for a response, and stores the answer in a global variable before moving on.

```json
{
  "id": "node_ask_01",
  "type": "ask_question",
  "label": "Get caller name",
  "position": { "x": 300, "y": 180 },
  "nextNodeId": "node_switch_01",
  "config": {
    "question": "Could I get your name please?",
    "storeIn": "customerName",
    "variableType": "string"
  }
}
```

| Config field | Type | Description |
|---|---|---|
| `question` | string | The question to ask the caller |
| `storeIn` | string | Name of the global variable to write the answer into |
| `variableType` | string | Expected type: `"string"`, `"number"`, or `"boolean"` |

---

### Get details

Instructs the LLM to collect multiple pieces of information from the caller in a natural conversation. The node stays active until all required fields are filled.

```json
{
  "id": "node_getdetails_01",
  "type": "get_details",
  "label": "Collect contact info",
  "position": { "x": 300, "y": 460 },
  "nextNodeId": "node_calendar_01",
  "config": {
    "prompt": "Collect the caller's contact details needed to make a booking.",
    "fields": [
      {
        "variable": "customerPhone",
        "description": "The caller's contact phone number",
        "type": "string",
        "required": true
      },
      {
        "variable": "customerEmail",
        "description": "The caller's email address for the booking confirmation",
        "type": "string",
        "required": false
      }
    ]
  }
}
```

| Config field | Type | Description |
|---|---|---|
| `prompt` | string | Instruction passed to the LLM describing the goal of this step |
| `fields` | array | List of fields to collect |
| `fields[].variable` | string | Global variable to store the collected value in |
| `fields[].description` | string | Natural language description of what to ask for |
| `fields[].type` | string | Expected type: `"string"`, `"number"`, or `"boolean"` |
| `fields[].required` | boolean | If `true`, the node will not advance until this field is filled |

---

### Calendar booker

Retrieves available time slots from cal.com, presents them to the caller in natural language, confirms a selection, and creates the booking. Stores the result in global variables.

```json
{
  "id": "node_calendar_01",
  "type": "calendar_booker",
  "label": "Book appointment",
  "position": { "x": 300, "y": 580 },
  "nextNodeId": "node_action_01",
  "config": {
    "calComEventTypeId": 42,
    "calComApiKey": "{{ secrets.CAL_COM_API_KEY }}",
    "timezone": "Asia/Colombo",
    "bookingConfirmationVariable": "bookingConfirmed",
    "bookingIdVariable": "bookingId",
    "bookingTimeVariable": "bookingTime",
    "attendeeNameVariable": "customerName",
    "attendeeEmailVariable": "customerEmail",
    "confirmationMessage": "Perfect, {{ customerName }}! I've booked you in for {{ bookingTime }}."
  }
}
```

| Config field | Type | Description |
|---|---|---|
| `calComEventTypeId` | number | The cal.com event type to book against |
| `calComApiKey` | string | API key, referenced via `{{ secrets.KEY_NAME }}` |
| `timezone` | string | IANA timezone for presenting available slots to the caller |
| `bookingConfirmationVariable` | string | Global variable to set `true` on successful booking |
| `bookingIdVariable` | string | Global variable to store the cal.com booking ID |
| `bookingTimeVariable` | string | Global variable to store the confirmed booking time as a string |
| `attendeeNameVariable` | string | Global variable containing the attendee's name |
| `attendeeEmailVariable` | string | Global variable containing the attendee's email |
| `confirmationMessage` | string | Message spoken to the caller after booking; supports `{{ variable }}` interpolation |

---

### Answer queries

The LLM answers free-form questions from the caller using the provided knowledge base. Stays active for multiple turns until the caller's questions are resolved or `maxTurns` is reached.

```json
{
  "id": "node_query_01",
  "type": "answer_queries",
  "label": "Answer business questions",
  "position": { "x": 60, "y": 460 },
  "nextNodeId": "node_end_01",
  "config": {
    "knowledgeBase": "Acme Corp provides plumbing, electrical, and HVAC services...",
    "fallbackMessage": "I'm sorry, I don't have that information. Would you like me to transfer you?",
    "maxTurns": 6
  }
}
```

| Config field | Type | Description |
|---|---|---|
| `knowledgeBase` | string | Text the LLM uses to answer questions; can be a long string or a summary |
| `fallbackMessage` | string | Spoken when the LLM cannot find an answer in the knowledge base |
| `maxTurns` | number | Maximum number of back-and-forth exchanges before moving to `nextNodeId` |

---

### Switch

Classifies the caller's last utterance into one of a set of defined cases, then routes to the corresponding node. This is the primary branching mechanism.

```json
{
  "id": "node_switch_01",
  "type": "switch",
  "label": "Route by intent",
  "position": { "x": 300, "y": 300 },
  "nextNodeId": null,
  "config": {
    "prompt": "Based on what {{ customerName }} just said, classify their intent.",
    "cases": [
      { "value": "query",    "label": "General question",       "nextNodeId": "node_query_01"      },
      { "value": "booking",  "label": "Wants to book an appointment", "nextNodeId": "node_getdetails_01" },
      { "value": "transfer", "label": "Wants to speak to a human",   "nextNodeId": "node_transfer_01"  }
    ],
    "defaultCaseNextNodeId": "node_query_01"
  }
}
```

| Config field | Type | Description |
|---|---|---|
| `prompt` | string | Instruction to the LLM explaining how to classify the input |
| `cases` | array | The possible branches |
| `cases[].value` | string | Internal identifier for this case |
| `cases[].label` | string | Human-readable description used by the LLM to pick the right case |
| `cases[].nextNodeId` | string | Node to route to if this case is selected |
| `defaultCaseNextNodeId` | string | Node to route to if no case matches |

> The top-level `nextNodeId` must be `null` on switch nodes — routing is handled entirely within `config.cases`.

---

### Action

Sends the current global variable state to an external webhook (e.g. an n8n workflow) as a JSON POST request. Used to push data into CRMs, databases, or other systems.

```json
{
  "id": "node_action_01",
  "type": "action",
  "label": "Send booking to CRM",
  "position": { "x": 300, "y": 700 },
  "nextNodeId": "node_end_01",
  "config": {
    "webhookUrl": "https://n8n.acmecorp.com/webhook/crm-intake",
    "method": "POST",
    "payload": {
      "customerName":  "{{ customerName }}",
      "bookingId":     "{{ bookingId }}"
    },
    "onSuccess": "continue",
    "onFailure": "continue"
  }
}
```

| Config field | Type | Description |
|---|---|---|
| `webhookUrl` | string | The URL to POST to |
| `method` | string | HTTP method — currently always `"POST"` |
| `payload` | object | Key-value pairs to send; values support `{{ variable }}` interpolation |
| `onSuccess` | string | What to do after a successful call: `"continue"` moves to `nextNodeId` |
| `onFailure` | string | What to do on failure: `"continue"` moves on anyway; `"stop"` ends the workflow |

---

### Transfer call

Speaks a hold message and transfers the call to a phone number.

```json
{
  "id": "node_transfer_01",
  "type": "transfer_call",
  "label": "Transfer to live agent",
  "position": { "x": 560, "y": 460 },
  "nextNodeId": "node_end_01",
  "config": {
    "message": "Please hold while I connect you with one of our team members.",
    "transferTo": "+94112345678",
    "transferType": "cold"
  }
}
```

| Config field | Type | Description |
|---|---|---|
| `message` | string | Spoken to the caller before the transfer; supports `{{ variable }}` interpolation |
| `transferTo` | string | E.164 phone number to transfer to |
| `transferType` | string | `"cold"` transfers immediately; `"warm"` (future) will announce the caller first |

---

## Variable interpolation

Any string value in a node's `config` can reference a global variable using double-curly-brace syntax:

```
"message": "Hello {{ customerName }}, your booking ID is {{ bookingId }}."
```

The runtime substitutes the current value of each variable before the string is used. If a variable is `null` at substitution time, it renders as an empty string.

Secrets (such as API keys) follow the same syntax but are sourced from a separate secrets store rather than `globalVariables`:

```
"calComApiKey": "{{ secrets.CAL_COM_API_KEY }}"
```

---

## Execution model

1. The runtime receives an inbound websocket connection from the connector microservice.
2. It loads the workflow and initialises `globalVariables` to their default values.
3. Execution starts at `entryNodeId`.
4. Each node runs its logic, updates `globalVariables` as needed, then returns its `nextNodeId`.
5. For switch nodes, the LLM classifies the input and returns the matching `cases[].nextNodeId`.
6. Execution continues until a node returns `nextNodeId: null`.

---

## Adding new node types

To add a new node type:

1. Define its `type` string (snake_case).
2. Document the fields its `config` block requires.
3. Specify whether it uses top-level `nextNodeId` (linear) or resolves routing internally (branching).
4. Implement the runtime handler and canvas renderer for the new type.
