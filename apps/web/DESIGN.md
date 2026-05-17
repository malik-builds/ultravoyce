# Workflow editor — design spec

## Design direction

The editor takes cues from n8n's dark, technical aesthetic but pushes it into something more refined and purposeful. The visual language is **dark-first, precision-engineered** — like a high-end audio interface or a professional video editor. Everything on screen is functional. Decoration exists only when it carries meaning.

The one thing users will remember: the canvas feels *alive*. Connections between nodes pulse with a subtle animated gradient when a workflow is running. Nodes feel like physical objects — slightly elevated, with crisp shadows that respond to selection state.

---

## Typography

Two typefaces, used with discipline.

| Role | Font | Weight | Size |

|---|---|---|---|
| UI labels, node titles, body | [Geist](https://vercel.com/font) | 400, 500 | 11–14px |
| Workflow name, page headings | [Geist Mono](https://vercel.com/font) | 400, 500 | 14–22px |
| Code, JSON previews, variable names | Geist Mono | 400 | 11–12px |

Geist is purpose-built for developer tooling. Geist Mono used for the workflow name gives it a technical, purposeful feel — like naming a script, not a document.

**Rules:**
- No font size below 11px anywhere.
- Labels are sentence case throughout — no ALL CAPS, no Title Case.
- Line height 1.4 for multi-line text, 1 for single-line labels.
- Letter spacing: `-0.01em` on headings, `0` on body, `0.04em` on monospaced variable names.

---

## Colour palette

Dark theme only. No light mode.

### Base surfaces

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#0e0e10` | App background, canvas background |
| `--bg-surface` | `#161618` | Sidebars, panels, modals |
| `--bg-elevated` | `#1e1e21` | Node cards, dropdowns, tooltips |
| `--bg-hover` | `#26262b` | Hover states on interactive elements |
| `--bg-active` | `#2e2e34` | Active/pressed states |

### Borders

| Token | Hex | Usage |
|---|---|---|
| `--border-subtle` | `#ffffff0f` | Panel dividers, section separators |
| `--border-default` | `#ffffff1a` | Node card borders, input borders |
| `--border-strong` | `#ffffff33` | Selected state borders, focused inputs |

### Text

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#f0f0f2` | Node labels, headings, primary content |
| `--text-secondary` | `#8b8b99` | Subtitles, descriptions, placeholder text |
| `--text-tertiary` | `#55555f` | Disabled states, metadata |

### Accent — the signature colour

The primary accent is a bright vermillion. Bold and warm against the dark surfaces — immediate and high-energy without feeling aggressive.

| Token | Hex | Usage |
|---|---|---|
| `--accent` | `#ff3d2e` | Selected node border, active handle, primary buttons, edge colour |
| `--accent-dim` | `#ff3d2e22` | Selected node background tint, focus rings |
| `--accent-bright` | `#ff6054` | Hover state on accent elements |

### Node type colours

Each node type has a single accent colour used for its left border stripe, icon, and type badge. These are the only colours on node cards — everything else is neutral.

| Node type | Colour | Hex |
|---|---|---|
| tell | Teal | `#2dd4bf` |
| ask_question | Teal | `#2dd4bf` |
| get_details | Sky | `#38bdf8` |
| calendar_booker | Sky | `#38bdf8` |
| answer_queries | Violet | `#a78bfa` |
| switch | Amber | `#fbbf24` |
| action | Slate | `#94a3b8` |
| transfer_call | Rose | `#fb7185` |

### Semantic colours

| Token | Hex | Usage |
|---|---|---|
| `--success` | `#34d399` | Valid state indicators, saved confirmation |
| `--warning` | `#fbbf24` | Warning borders, missing optional config |
| `--error` | `#f87171` | Error borders, validation failures |
| `--info` | `#60a5fa` | Informational toasts |

---

## Canvas

### Background

The canvas background is `--bg-base` (`#0e0e10`) with a dot grid overlay. The grid is rendered as a subtle repeating SVG pattern:

- Dot colour: `#ffffff08` — barely visible, purely to reinforce spatial orientation
- Dot size: 1px
- Grid spacing: 24px

No axis lines. No numbered grid. Just dots.

### Zoom and pan feel

Pan is smooth with no friction. Zoom is centred on the mouse cursor. The minimum zoom (25%) renders nodes as simplified collapsed chips — label only, no subtitle, no handles visible. At full zoom (100%+) full node detail is shown.

### Selection box

Click-drag on empty canvas creates a selection rectangle. Fill: `--accent-dim`. Border: `--accent` at 1px, dashed.

---

## Node cards

Node cards are the primary interactive element. They are designed to feel like physical components — distinct, readable, and slightly elevated above the canvas.

### Anatomy

```
┌──┬──────────────────────────────────┐
│  │  [icon]  Label            [type] │  ← header row
│  ├──────────────────────────────────┤
│  │  Subtitle / config preview       │  ← body (optional)
└──┴──────────────────────────────────┘
▲
Colour stripe (4px, left edge)
```

- **Width:** 240px fixed.
- **Min height:** 56px (header only). Expands to fit body content.
- **Background:** `--bg-elevated`
- **Border:** 1px solid `--border-default`
- **Border radius:** 10px
- **Left stripe:** 4px wide, full height, colour from node type table above. Border radius only on the left side (`border-radius: 10px 0 0 10px` on the stripe element).
- **Box shadow (default):** `0 2px 8px #00000044`
- **Box shadow (selected):** `0 0 0 2px var(--accent), 0 4px 16px #00000066`
- **Box shadow (error):** `0 0 0 2px var(--error)`
- **Box shadow (warning):** `0 0 0 2px var(--warning)`

### Header row

- **Icon:** 16px, coloured to match the node type stripe. SVG icon, one per node type.
- **Label:** 13px, `--text-primary`, Geist 500. Truncated with ellipsis if over ~180px.
- **Type badge:** right-aligned pill. 10px Geist Mono, `--text-tertiary`, background `--bg-hover`, border `--border-subtle`. Text is the node type string (e.g. `tell`, `switch`).
- Padding: 12px horizontal, 14px vertical.

### Body row

- Shown only when there is meaningful config to preview.
- 11px Geist, `--text-secondary`.
- Padding: 4px 12px 12px 12px (tight top, flush with header).
- Truncated at one line.

### Connection handles

Handles are the circular connectors on the top (input) and bottom (output) of each node.

- **Size:** 10px diameter.
- **Background:** `--bg-base`
- **Border:** 2px solid `--border-strong`
- **On hover:** border becomes `--accent`, scale 1.2.
- **When connected:** filled with `--accent`.
- **Position:** centred horizontally on top/bottom edge, sitting half-outside the card border.

Switch nodes have multiple output handles — one per case — evenly spaced along the bottom edge, each labelled with the case value in 10px `--text-tertiary` below the handle.

### Entry node indicator

The entry node (matching `entryNodeId`) shows a small "start" label above the top edge of the card, in 10px Geist Mono `--text-tertiary`. A thin line connects the label to the top input handle, styled like a leader line.

---

## Edges (connections)

Edges are the lines connecting nodes. They are the most important visual element on the canvas — they define the workflow.

- **Style:** Smooth bezier curve (React Flow `smoothstep` or `bezier`).
- **Stroke:** `--border-strong` at 1.5px by default.
- **Selected stroke:** `--accent` at 2px.
- **Animated stroke:** When a workflow is executing, the active edge animates a moving dash — a short bright segment (`--accent-bright`) travelling along the path at ~1s per cycle. Implemented with `stroke-dasharray` and `stroke-dashoffset` CSS animation.
- **Delete button:** Hovering an edge reveals a small `×` button at its midpoint. Clicking removes the connection.
- **In-progress edge** (being drawn): dashed line from the source handle to the cursor. `--accent` at 1px, 4px dash, 4px gap.

---

## Sidebar — node palette

Left sidebar, 240px wide, fixed.

- Background: `--bg-surface`
- Right border: 1px solid `--border-subtle`
- No box shadow — flushes with the canvas edge

### Search

At the top: a compact search input. Placeholder: "Search nodes…". Filters the node list in real time. 36px tall, background `--bg-elevated`, border `--border-default`, 8px radius. Search icon (`--text-tertiary`) left-aligned inside.

### Node list

Nodes grouped under category headings:

- **Category heading:** 10px Geist Mono uppercase, `--text-tertiary`, 16px top padding, 8px bottom padding. Left-padded 16px.
- **Node item:** 48px tall, full-width, 16px horizontal padding. Background transparent. On hover: `--bg-hover`. Flex row: type-colour icon left, label and description stacked right.
  - Label: 13px Geist 500, `--text-primary`
  - Description: 11px Geist 400, `--text-tertiary`
- Drag handle cursor on hover.

No scrollbar visible unless needed. When dragging a node over the canvas, show a ghost preview of the node card following the cursor.

---

## Config panel

Right sidebar, 320px wide, slides in when a node is selected.

- Background: `--bg-surface`
- Left border: 1px solid `--border-subtle`
- Slides in from the right with a `transform: translateX` transition, 150ms ease-out. Canvas shrinks to accommodate (React Flow viewport adjusts).

### Panel header

- Node label in 14px Geist Mono 500, `--text-primary`, editable on click (becomes an inline input).
- Type badge below the label.
- Close button (`×`) top-right, 32px tap target.
- Bottom border: `--border-subtle`.

### Form fields

All fields follow a consistent pattern:

- **Field label:** 11px Geist 500, `--text-secondary`, uppercase, letter-spacing `0.06em`. 8px above the input.
- **Input:** 36px tall (single line), 40px (select), background `--bg-elevated`, border `1px solid --border-default`, 6px radius, 12px horizontal padding. 13px Geist 400, `--text-primary`.
- **Textarea:** Same as input but min-height 80px, resizable vertically.
- **Focus state:** border becomes `--border-strong`, `0 0 0 3px var(--accent-dim)` outer glow.
- **Error state:** border `--error`, helper text below in 11px `--error`.
- **Field spacing:** 20px between fields.

### Variable token autocomplete

In any textarea supporting `{{ variable }}`, typing `{{` opens a floating dropdown (4px below the cursor) listing all global variables. Each item shows the variable name in Geist Mono and its type in `--text-tertiary`. Selecting inserts the token and closes the dropdown.

### Repeatable field lists (get_details fields, switch cases, action payload)

Each row:
- 40px tall, full-width, background `--bg-elevated`, 6px radius, 1px border `--border-default`.
- Drag handle icon on the far left (reorder by dragging).
- Field inputs inline.
- Delete button (`×`) on the far right, visible on row hover.
- "Add row" button below the list: full-width, dashed border `--border-default`, 32px tall, `--text-tertiary` label. Hover: `--bg-hover`.

---

## Toolbar

Full-width top bar, 48px tall.

- Background: `--bg-surface`
- Bottom border: 1px solid `--border-subtle`

**Left:**
- App logo/wordmark — 20px, `--text-primary`.
- Separator (1px vertical, `--border-subtle`, 20px tall).
- Workflow name — editable inline, Geist Mono 14px, `--text-primary`. Click to edit. Shows a cursor on hover.

**Centre:**
- Undo / Redo — icon buttons, 32px tap target, `--text-secondary`. Disabled state: `--text-tertiary`.

**Right (left to right):**
- Variables button — text button, 13px, `--text-secondary`. Hover: `--text-primary`.
- Separator.
- Zoom controls — current zoom percentage (Geist Mono, 12px, `--text-secondary`) flanked by `−` and `+` buttons. Click percentage to reset to 100%.
- Separator.
- Sign out — icon button, `--text-tertiary`.
- Save button — primary action, see below.

### Save button states

| State | Appearance |
|---|---|
| No changes | Outlined button, `--border-default`, `--text-secondary`, label "Saved" with a `✓` |
| Unsaved changes | Filled `--accent` background, `--text-primary`, label "Save" |
| Saving | Filled `--accent` at 60% opacity, spinner icon, label "Saving…" |
| Error | Filled `--error` at 80%, label "Failed — retry" |

---

## Global variables panel

Opens as a drawer from the right, overlapping the config panel. 360px wide.

- Background: `--bg-surface`
- Backdrop: `#00000066` covering the canvas (but not the toolbar or sidebars).

### Variable rows

Each variable is a row:
- Variable name: 12px Geist Mono, `--text-primary`. Editable inline.
- Type badge: select styled as a small pill, options: `string` / `number` / `boolean`.
- Initial value: compact input, 80px wide, right-aligned.
- Delete button: `--text-tertiary` on hover.

"Add variable" button at the bottom: full-width, dashed, same style as the repeatable field list add button.

---

## Auth pages — `/sign-in` and `/sign-up`

Full-screen dark layout. Background: `--bg-base` with the same dot grid as the canvas — the visual language is consistent from the moment of first visit.

### Centred card

- Width: 400px.
- Background: `--bg-surface`.
- Border: 1px solid `--border-default`.
- Border radius: 12px.
- Padding: 40px.
- Box shadow: `0 8px 40px #00000055`.

### Content (sign-in)

1. Logo / wordmark — centred, 24px Geist Mono, `--text-primary`, 32px bottom margin.
2. Heading — "Welcome back" — 18px Geist 500, `--text-primary`.
3. Subheading — "Sign in to your account" — 13px Geist, `--text-secondary`, 24px bottom margin.
4. Email input — full-width, labelled "Email".
5. Password input — full-width, labelled "Password", with show/hide toggle.
6. **Sign in** button — full-width, 40px, filled `--accent`, 8px radius, 13px Geist 500.
7. Link — "Don't have an account? Sign up" — centred, 12px, `--text-secondary`. "Sign up" underlined in `--accent`.

Error state: a small error banner above the button — 11px `--error` text, background `#f8717115`, border `1px solid --error`, 6px radius, 10px padding.

### Content (sign-up)

Same layout as sign-in, with:

1. Heading — "Create an account".
2. Subheading — "Start building voice agents".
3. Email, Password, Confirm password inputs.
4. **Create account** button.
5. Link — "Already have an account? Sign in".
6. After successful signup: replace the form with a confirmation message — "Check your email to confirm your account" — with a mail icon above it.

---

## Workflow list page — `/workflows`

### Layout

Full-screen. Top navbar (same `--bg-surface` bar as the editor toolbar, 48px). Below: a content area with a max-width of 960px, centred.

### Navbar

- Logo left.
- "New workflow" button right — filled `--accent`.
- Sign out icon button far right.

### Workflow grid

Workflows displayed in a responsive grid (3 columns at 960px, 2 at tablet, 1 at mobile). Each card:

- Background: `--bg-elevated`
- Border: 1px solid `--border-default`
- Border radius: 10px
- Padding: 20px
- Hover: border becomes `--border-strong`, slight upward translate (`transform: translateY(-2px)`), box shadow deepens.

**Card content:**
- Workflow name: 14px Geist Mono 500, `--text-primary`.
- Description: 12px Geist, `--text-secondary`, two-line clamp.
- Node count: 11px Geist Mono, `--text-tertiary` — e.g. `6 nodes`.
- Updated at: 11px Geist, `--text-tertiary`, bottom of card — e.g. `Updated 2 hours ago`.
- On hover: three-dot menu appears top-right with options: Edit, Duplicate, Delete.

### Empty state

When a user has no workflows:

Centred vertically in the content area. A faint canvas-grid rectangle (180×120px, `--border-subtle`) acts as a visual metaphor for an empty canvas. Below it:

- "No workflows yet" — 16px Geist 500, `--text-primary`.
- "Create your first voice agent workflow." — 13px, `--text-secondary`.
- "New workflow" button — filled `--accent`.

---

## Motion principles

- **Transitions:** 150ms ease-out for panel slides, state changes, hover effects. Nothing slower than 250ms in the core UI.
- **Canvas interactions:** No transition on node drag (must feel immediate). Edge drawing is real-time with no lag.
- **Running workflow animation:** The edge dash animation is the only persistent animation. Everything else is triggered by interaction.
- **Page transitions:** Fade only (opacity 0→1, 100ms). No slides between pages.
- **Reduced motion:** All animations respect `prefers-reduced-motion`. The edge dash animation is disabled; edges remain static.

---

## Spacing system

8px base unit. All spacing values are multiples of 4px.

| Token | Value | Usage |
|---|---|---|
| `--space-1` | 4px | Tight internal padding, icon gaps |
| `--space-2` | 8px | Input internal padding, small gaps |
| `--space-3` | 12px | Node card padding |
| `--space-4` | 16px | Section padding, sidebar item padding |
| `--space-5` | 20px | Field spacing in config panel |
| `--space-6` | 24px | Panel section gaps |
| `--space-8` | 32px | Large section separators |
| `--space-10` | 40px | Auth card padding |

---

## Component states

Every interactive element has all five states defined:

| State | Treatment |
|---|---|
| Default | As specified above |
| Hover | Background lightens one step (`--bg-elevated` → `--bg-hover`) or border strengthens |
| Focus | 3px `--accent-dim` outer ring, border becomes `--border-strong` |
| Active/pressed | Background darkens one step, scale `0.98` |
| Disabled | Opacity `0.4`, cursor `not-allowed`, no hover effect |

---

## Icons

Use [Lucide](https://lucide.dev) throughout — consistent stroke weight (1.5px), 16px default size. One icon per node type, chosen for semantic clarity:

| Node type | Icon |
|---|---|
| tell | `message-circle` |
| ask_question | `help-circle` |
| get_details | `clipboard-list` |
| calendar_booker | `calendar` |
| answer_queries | `book-open` |
| switch | `git-branch` |
| action | `zap` |
| transfer_call | `phone-forwarded` |

Toolbar icons: `undo-2`, `redo-2`, `variable`, `zoom-in`, `zoom-out`, `log-out`, `save`.
