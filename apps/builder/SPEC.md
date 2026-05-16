# Workflow editor — frontend spec

## Overview

A node-based, drag-and-drop workflow editor built in Next.js. Users visually compose voice agent workflows by placing nodes on a canvas, connecting them, and configuring each node's behaviour through a side panel. The editor serialises the workflow to the JSON schema defined in `workflow-schema.md` and persists it to the backend.

---

## Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) | |
| Canvas library | [React Flow](https://reactflow.dev) | Handles node rendering, drag-and-drop, edges, zoom/pan |
| State management | Zustand | Lightweight; one store for workflow state |
| Forms | React Hook Form + Zod | Node config panels |
| Styling | Tailwind CSS | |
| Data fetching | TanStack Query | API calls to FastAPI backend |
| Database | Supabase | Workflow persistence |
| Auth | Supabase Auth | Email/password via `@supabase/ssr` |

---

## Pages

### `/sign-in`

Sign-in page. See [Authentication](#authentication).

### `/sign-up`

Sign-up page. See [Authentication](#authentication).

### `/workflows`

Lists all saved workflows belonging to the signed-in user. Each card shows the workflow name, description, and last updated time. Actions: open editor, duplicate, delete.

### `/workflows/new`

Creates a new blank workflow and redirects to `/workflows/[id]`.

### `/workflows/[id]`

The main editor. Full-screen canvas with a toolbar, node palette, and side panel. This is the primary surface described in the rest of this spec.

---

## Editor layout

```
┌─────────────────────────────────────────────────────────┐
│  Toolbar                                          [Save] │
├──────────────┬──────────────────────────┬───────────────┤
│              │                          │               │
│  Node        │                          │  Config       │
│  palette     │        Canvas            │  panel        │
│              │                          │  (contextual) │
│              │                          │               │
└──────────────┴──────────────────────────┴───────────────┘
```

- **Node palette** — left sidebar, ~240px wide. Lists all available node types. Drag onto canvas to add.
- **Canvas** — centre, fills remaining space. Infinite scrollable, zoomable.
- **Config panel** — right sidebar, ~320px wide. Appears when a node is selected. Hidden when nothing is selected.
- **Toolbar** — top bar. Workflow name (editable inline), save button, zoom controls, undo/redo.

---

## Canvas

Built on React Flow. Key behaviours:

- Nodes are draggable anywhere on the canvas.
- Connecting two nodes: drag from the output handle of one node to the input handle of another. This sets `nextNodeId` on the source node.
- Each node has one output handle (bottom) and one input handle (top), except switch nodes which have one input and multiple outputs (one per case).
- Deleting an edge sets `nextNodeId` to `null` on the source node.
- Only one connection can leave a non-branching node's output at a time. Drawing a new connection replaces the existing one.
- The entry node (matching `entryNodeId`) is visually marked with a distinct indicator (e.g. a small "Start" badge above it).
- Right-clicking a node opens a context menu: Edit, Duplicate, Delete.
- Deleting a node also deletes its incoming and outgoing connections.

### Zoom and pan

- Mouse wheel to zoom. Click and drag on empty canvas to pan.
- Zoom controls in toolbar: zoom in, zoom out, fit to screen.
- Minimum zoom: 25%. Maximum zoom: 150%.

---

## Node palette

A scrollable left sidebar listing all node types grouped by category.

### Categories and node types

**Conversation**
- Tell
- Ask question
- Get details
- Answer queries

**Actions**
- Calendar booker
- Transfer call
- Action (webhook)

**Logic**
- Switch

Each item in the palette shows the node type icon, name, and a one-line description. Drag from the palette onto the canvas to create a new node with default config. Clicking (without dragging) also adds the node to the centre of the current viewport.

---

## Node cards (canvas)

Each node renders as a compact card on the canvas. All cards share the same structure:

```
┌─────────────────────────┐
│  [icon]  Label     [type badge] │
│  subtitle / key config preview  │
└─────────────────────────┘
```

- **Label** — the user-defined label for this node (e.g. "Greet caller").
- **Type badge** — small pill showing the node type (e.g. "tell", "switch").
- **Subtitle** — a short preview of the node's key config. For example:
  - `tell` → first 40 chars of `config.message`
  - `ask_question` → the question text
  - `get_details` → "Collecting N fields"
  - `calendar_booker` → "cal.com event #42"
  - `answer_queries` → "Up to N turns"
  - `switch` → "N cases"
  - `action` → the webhook URL hostname
  - `transfer_call` → the `transferTo` number

Node cards are colour-coded by type — consistent with the palette:

| Node type | Colour |
|---|---|
| tell | Teal |
| ask_question | Teal |
| get_details | Blue |
| calendar_booker | Blue |
| answer_queries | Purple |
| switch | Amber |
| action | Gray |
| transfer_call | Coral |

Selected nodes get a highlighted border. Invalid nodes (missing required config) get a red border and a warning icon.

---

## Config panel

Opens in the right sidebar when a node is selected. Closes when the canvas background is clicked.

The panel always shows:
- **Label** — text input, editable.
- **Node type** — read-only badge.
- Type-specific config fields (see below).

Changes apply immediately to the in-memory workflow state. The workflow is not saved to the backend until the user clicks Save.

### Tell

| Field | Input type | Notes |
|---|---|---|
| Message | Textarea | Supports `{{ variable }}` tokens; show autocomplete dropdown when `{{` is typed |

### Ask question

| Field | Input type | Notes |
|---|---|---|
| Question | Textarea | |
| Store in | Variable picker | Dropdown of existing global variables + option to create new |
| Variable type | Select | string / number / boolean |

### Get details

| Field | Input type | Notes |
|---|---|---|
| Prompt | Textarea | Instruction to the LLM |
| Fields | Repeatable field list | Each row: variable picker, description input, type select, required toggle. Add/remove rows. |

### Calendar booker

| Field | Input type | Notes |
|---|---|---|
| Event type ID | Number input | cal.com event type |
| API key | Text input | Prefixed with `{{ secrets. }}` — show secrets picker |
| Timezone | Select | IANA timezone list |
| Attendee name variable | Variable picker | |
| Attendee email variable | Variable picker | |
| Booking confirmation variable | Variable picker | Boolean; set to true on success |
| Booking ID variable | Variable picker | |
| Booking time variable | Variable picker | |
| Confirmation message | Textarea | Supports `{{ variable }}` tokens |

### Answer queries

| Field | Input type | Notes |
|---|---|---|
| Knowledge base | Textarea (tall) | |
| Fallback message | Textarea | |
| Max turns | Number input | Default: 5 |

### Switch

| Field | Input type | Notes |
|---|---|---|
| Prompt | Textarea | LLM classification instruction; supports `{{ variable }}` tokens |
| Cases | Repeatable case list | Each row: value (text input), label (text input), next node (auto-wired from canvas connection). Add/remove rows. |
| Default case | Next-node picker | Dropdown of nodes in the workflow |

Each case in the list shows the outgoing connection handle on the node card. Adding a case adds a new output handle.

### Action

| Field | Input type | Notes |
|---|---|---|
| Webhook URL | Text input | |
| Method | Select | POST only for now |
| Payload | Key-value editor | Each row: key (text), value (text, supports `{{ variable }}`). Add/remove rows. |
| On success | Select | continue |
| On failure | Select | continue / stop |

### Transfer call

| Field | Input type | Notes |
|---|---|---|
| Message | Textarea | Supports `{{ variable }}` tokens |
| Transfer to | Text input | E.164 phone number |
| Transfer type | Select | cold / warm (warm disabled, labelled "coming soon") |

---

## Global variables panel

Accessible via a "Variables" button in the toolbar. Opens as a modal or a drawer.

Shows all `globalVariables` defined in the workflow. Each row:
- Variable name (editable)
- Type (select: string / number / boolean)
- Initial value (editable)
- Delete button

Users can add new variables here. Variables created via node config panels (e.g. "Store in" on Ask question) automatically appear in this list.

---

## Toolbar

Left side:
- Workflow name — inline editable text field.

Centre:
- Undo / Redo buttons.

Right side:
- **Variables** button — opens the global variables panel.
- **Zoom controls** — fit to screen, zoom in/out, zoom percentage display.
- **Save** button — saves the workflow to the backend. Shows a spinner while saving, then a brief "Saved" confirmation. Shows an unsaved changes indicator (dot on the button) when there are pending changes.

---

## Validation

The editor validates the workflow in real time and surfaces issues without blocking editing.

### Validation rules

| Rule | Severity | Indicator |
|---|---|---|
| Node has no label | Warning | Yellow border on node |
| Required config field is empty | Error | Red border on node + warning icon |
| `nextNodeId` points to a node that doesn't exist | Error | Red edge |
| A non-switch node has no outgoing connection | Warning | Dashed output handle |
| Switch node has a case with no outgoing connection | Warning | Dashed handle on that case |
| No entry node set | Error | Banner in toolbar |
| `storeIn` variable on Ask question node is not declared in `globalVariables` | Warning | Auto-resolve prompt in config panel |

Clicking the Save button while there are errors shows a summary panel listing all errors. Saving is blocked when errors exist; warnings do not block saving.

---

## Workflow serialisation

When the user saves, the editor serialises the current canvas state to the workflow JSON schema:

- Node positions are written to each node's `position` field from React Flow's node coordinates.
- `nextNodeId` is derived from the edge connecting a node's output handle to the next node's input.
- For switch nodes, `cases[].nextNodeId` is derived from each case's individual output handle connection.
- `entryNodeId` is the node with no incoming edges (or the one manually designated via right-click → "Set as entry").
- The serialised JSON is POST'd to `PATCH /api/workflows/[id]`.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl + S` | Save |
| `Cmd/Ctrl + Z` | Undo |
| `Cmd/Ctrl + Shift + Z` | Redo |
| `Delete` / `Backspace` | Delete selected node or edge |
| `Cmd/Ctrl + D` | Duplicate selected node |
| `Escape` | Deselect / close config panel |
| `Space + drag` | Pan canvas |
| `Cmd/Ctrl + Shift + F` | Fit canvas to screen |

---

## Persistence

Workflows are saved directly to Supabase from the Next.js frontend using the Supabase JS client. There is no separate backend API for workflow CRUD — Supabase handles it.

### Database table

```sql
create table workflows (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  workflow   jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Users can only access their own workflows
alter table workflows enable row level security;

create policy "owner access" on workflows
  for all using (auth.uid() = user_id);
```

The `workflow` column stores the full workflow JSON as defined in `workflow-schema.md`. The `id` column serves as the workflow's UUID and maps to `workflow.id` inside the JSON.

### Client operations

All operations use the Supabase JS client (`@supabase/ssr`) and are wrapped in TanStack Query hooks.

| Action | Supabase call |
|---|---|
| List workflows | `supabase.from('workflows').select('id, workflow->name, workflow->description, updated_at').eq('user_id', uid)` |
| Load workflow | `supabase.from('workflows').select('workflow').eq('id', id).single()` |
| Create workflow | `supabase.from('workflows').insert({ id: uuid(), user_id: uid, workflow: json })` |
| Save workflow | `supabase.from('workflows').update({ workflow: json, updated_at: now() }).eq('id', id)` |
| Delete workflow | `supabase.from('workflows').delete().eq('id', id)` |
| Duplicate workflow | Insert a new row with a new UUID, copying the `workflow` JSON and updating `workflow.id` to match |

### Save behaviour in the editor

When the user saves (`Cmd+S` or the Save button), the editor:

1. Calls `serialise()` on the Zustand store to produce the workflow JSON.
2. Sets `isSaving: true` on the store.
3. Upserts the row in Supabase.
4. On success: sets `isDirty: false`, briefly shows "Saved" in the toolbar.
5. On failure: shows an inline error toast; `isDirty` remains `true`.

---

## Authentication

Auth is handled entirely by Supabase Auth using email and password. The `@supabase/ssr` package is used to manage sessions server-side via Next.js middleware.

### Middleware

A Next.js middleware (`middleware.ts`) runs on every request and:

- Refreshes the Supabase session cookie if it is close to expiry.
- Redirects unauthenticated users to `/sign-in` when they attempt to access any route under `/workflows`.
- Redirects already-authenticated users away from `/sign-in` and `/sign-up` to `/workflows`.

```
Protected routes:  /workflows, /workflows/*, /workflows/new
Public routes:     /sign-in, /sign-up
```

### `/sign-in` page

A centred card layout with:

- App name / logo at the top.
- Email input.
- Password input.
- **Sign in** button — calls `supabase.auth.signInWithPassword()`. On success, redirects to `/workflows`. On failure, shows an inline field-level error ("Invalid email or password").
- Link to `/sign-up` ("Don't have an account? Sign up").

No magic link, no OAuth — email/password only for now.

### `/sign-up` page

A centred card layout with:

- App name / logo at the top.
- Email input.
- Password input (min 8 characters, validated client-side with Zod).
- Confirm password input.
- **Create account** button — calls `supabase.auth.signUp()`. On success, shows a confirmation message ("Check your email to confirm your account") rather than redirecting immediately, since Supabase sends a confirmation email by default.
- Link to `/sign-in` ("Already have an account? Sign in").

### Sign out

A **Sign out** button is shown in the top-right corner of the `/workflows` list page and in the editor toolbar. Calls `supabase.auth.signOut()` and redirects to `/sign-in`.

### Session in the Zustand store

The Zustand store does not manage auth state. Auth state is read directly from the Supabase client where needed (e.g. to get `user.id` for insert operations). The middleware is the single source of truth for route protection.

---

## State management (Zustand store)

The editor maintains a single Zustand store with the following shape:

```typescript
interface WorkflowStore {
  // Workflow metadata
  id: string
  name: string
  version: number
  trigger: Trigger
  entryNodeId: string | null

  // Nodes and variables
  nodes: WorkflowNode[]
  globalVariables: Record<string, GlobalVariable>

  // Editor UI state
  selectedNodeId: string | null
  isDirty: boolean
  isSaving: boolean

  // Actions
  setName: (name: string) => void
  addNode: (type: NodeType, position: Position) => void
  updateNode: (id: string, patch: Partial<WorkflowNode>) => void
  deleteNode: (id: string) => void
  duplicateNode: (id: string) => void
  connectNodes: (fromId: string, toId: string, caseValue?: string) => void
  disconnectNodes: (fromId: string, caseValue?: string) => void
  setEntryNode: (id: string) => void
  setSelectedNode: (id: string | null) => void
  addGlobalVariable: (name: string, type: VariableType) => void
  updateGlobalVariable: (name: string, patch: Partial<GlobalVariable>) => void
  deleteGlobalVariable: (name: string) => void
  undo: () => void
  redo: () => void
  save: () => Promise<void>
  load: (workflowId: string) => Promise<void>
  serialise: () => WorkflowJSON
}
```

Undo/redo is implemented by maintaining a history stack of serialised workflow snapshots. A snapshot is pushed on every meaningful state change (node added, config changed, connection made/broken).

---

## Empty state

When the canvas has no nodes, show a centred prompt:

> "Drag a node from the left panel to get started, or start with a template."

Offer two template buttons: "Calendar booking agent" and "Receptionist agent". Clicking one populates the canvas with the corresponding example workflow.
