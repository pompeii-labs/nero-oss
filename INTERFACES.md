# Nero: Interfaces

Companion to VISION.md. The dynamic UI system. Living document.

## Goal

Nero can throw up arbitrary, beautiful, on-brand UI to any display: news stories, dashboards, charts, videos, 3D models, custom panels, embedded data, internal controls, anything. Closer to Jarvis than to a widget library.

## Tiered architecture

Four tiers, used together. Most usage is Tier 1 + 2. Tier 3 is the escape hatch with no ceiling. Tier 4 is the fast path for opening real-world content.

### Tier 1: Rich primitive library (declarative)

Native Svelte components living in the codebase, all sharing the same motion vocabulary, palette, and material treatment. Nero composes them in a tree.

Categories:
- **Content**: heading, prose, markdown, code block, blockquote, callout, quote
- **Data**: chart (line / bar / area / sparkline / scatter), table, kpi, timeline, map, calendar, kanban, tree
- **Media**: video player, audio player, image gallery, 3D model viewer (gltf via three.js), pdf viewer, iframe embed (chromed)
- **Input**: button, slider, toggle, select, multi-select, text input, textarea, search, date picker, time picker, file drop, color picker, signature
- **Composition**: grid, stack, tabs, accordion, split, scroll, sticky, dock
- **Domain**: news card, weather card, stock ticker, transit, contact card, file preview, RSS feed, message thread, event card

These are the bricks. Wide enough that 90% of real interfaces can be assembled from them without generating new code.

### Tier 2: Data-bound components (declarative + binding)

Components can declare a typed data source. Sources are registered server-side and have credentials brokered, never inlined.

Source schemes:
- `mcp://server/tool` — MCP tool result, with poll interval or subscription
- `http://...` — REST endpoint, named credential reference, cache policy
- `rss://...` — feed
- `ws://...` — websocket subscription
- `nero://memory/...` — memory store
- `nero://graph/...` — knowledge graph node
- `nero://function/<id>` — Nero-defined transform / aggregation

A chart bound to `mcp://homeassistant/sensor.living_room_temp` updates live. A kanban bound to a Linear query refreshes on tick. Composition is still declarative; the component handles fetching, polling, error states, loading skeletons.

### Tier 3: Generative slot (escape hatch, day one)

When nothing in Tiers 1+2 fits, Nero writes a custom Svelte component for the situation. Aggressive use is fine.

Mechanism:
- Nero emits Svelte source plus a manifest (data sources it needs, props, required permissions).
- Server compiles to JS. Cached by content hash.
- Rendered in a sandboxed iframe served from a separate origin.
- Strict CSP: no network beyond brokered data sources, no top-window access, no eval, no parent DOM.
- Communicates with the host via a typed `postMessage` protocol (action emit, state update, lifecycle).
- Credentials never enter the iframe. Data sources are proxied by the host.
- Generated components are versioned and cacheable so common ones don't recompile.

Tier 3 is for anything one-of-a-kind or visually bespoke. The cost (compile latency, sandbox overhead) is worth it when the goal is "something only Nero would think to build."

### Tier 4: Web embed (fast path)

For "play this video", "open this dashboard", "show this site": iframe with Nero chrome. Used when reformatting isn't worth it (live video, third-party tools we don't own).

For news articles and similar readable content, prefer **fetch + sanitize + reformat** through Tier 1 prose components. An iframed CNN page looks like CNN. A reformatted one looks like Nero. Cohesion matters.

## Layout: hybrid tiling + floating

Two layout modes coexist. Nero picks per panel.

**Tiling mode** (default for thrown-up info panels):
- Auto-arranged within the display canvas
- Snap zones: dock-left, dock-right, dock-top, dock-bottom, fill, half, third, quarter
- Multiple tiled panels share space cleanly
- Predictable, calm, glanceable

**Floating mode** (for cinematic / focal panels):
- Nero positions freely in canvas space
- Z-ordered, can overlap
- Used for hero panels, modals, interactive consoles, generative components
- More Jarvis-feel: a panel hovering at a deliberate spot

**Drag.** User can drag any panel to reposition. Tiling panels reflow around. Floating panels move freely. No saved layouts in v1; layout is per-session and Nero-driven, but the user can nudge.

**Reorganization.** When Nero throws a new panel or context shifts, layout reflows with motion. No hard rearrangement.

## Composition and inter-panel state

A shared session state bus per display. Panels can:
- Emit actions (`{ interfaceId, type: "action", action: "submitted", payload }`)
- Subscribe to other panels' state (`{ source: "panel-abc", key: "selectedCity" }`)
- Read shared context (current time, current display, Nero's focus, user presence)

This enables Jarvis behaviors: weather card → click city → adjacent chart updates. Chat panel → reference selected message → throws a related interface.

Nero observes everything on the bus and can react with tool calls, follow-up panels, or voice.

## Lifecycle

Each interface has a lifecycle tier:
- **Ephemeral**: dismisses after the user engages or after N seconds idle
- **Session**: persists until display reorganizes or topic shifts
- **Pinned**: stays until user dismisses (pin gesture)
- **System**: Nero's own ambient elements (clock, presence, notifications)

Nero can dismiss interfaces it threw up when context shifts. The "intelligently reorganize" rule from VISION.md is implemented here: on context change, run a reorganize pass that may dismiss, demote, or rearrange.

## Cross-display reach

Active presence is in one place. Reach is everywhere.

- Nero in the office can throw a recipe panel to the kitchen display without moving.
- A timer thrown to kitchen display persists there until done, even after Nero moves.
- The receiving display animates the arrival of the panel (fluid arriving from an edge), distinct from a full presence migration.
- Panels on remote displays still emit actions to Nero. The kitchen display's "skip step" button still calls home.

## Credential broker

External / authed sources never expose tokens to the client (and never to Tier 3 sandboxes).

- User stores credentials once (server-side, encrypted at rest)
- Components reference credentials by name, not value
- Server proxies the request, attaches the credential, returns sanitized data
- Same model as MCP today, generalized to HTTP / OAuth / API key sources
- Audit log of which interface used which credential when

## Motion language for interfaces

All four tiers share one motion system (defined in the web redesign):
- Arrival: fluid forms in from a direction, settles, breath
- Reflow: tiled panels glide, no hard snaps
- Dismissal: dissolves outward, fades
- Cross-display arrival: continuous with the migration choreography
- Drag: weighted, with subtle inertia
- Inter-panel reference: a hairline of light or material continuity between linked panels (subtle)

## What this is not

- Not a no-code builder. The user does not author interfaces in v1.
- Not a widget store. No plugin marketplace. Tier 3 is for Nero, not third parties.
- Not multi-tenant. One user, one home.

## Open questions / to design later

- Tier 3 component versioning, eviction, garbage collection
- Compile latency budget for Tier 3 (target: under 500ms warm, under 2s cold)
- Sandbox postMessage protocol exact schema
- How Nero discovers Tier 1 components (registry vs. embedded in system prompt vs. retrieval)
- Drag interactions between tiling and floating modes (does dragging a tiled panel float it?)
- Whether external credentials live in the existing `~/.nero/config.json` or a separate encrypted store

## Order of build

Sequence inside the interfaces workstream (after vision lock, after web redesign foundation):
1. Tier 1 library expansion + motion system
2. Layout engine (tiling, floating, drag, reflow)
3. Lifecycle + reorganization pass
4. Cross-display reach + remote panel arrival
5. Tier 2 data binding (sources, broker)
6. Tier 4 embed chrome + reformatting pipeline
7. Tier 3 generative slot (sandbox, compiler, postMessage protocol)
