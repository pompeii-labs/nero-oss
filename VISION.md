# Nero: Present

A working vision doc for the rework. Living document, expect edits.

## The shift

Nero today is a sophisticated on-demand assistant with strong UX. Capable, responsive, multi-interface. But it waits.

Nero next is a **present** thing. One mind, in the home, that knows where it is and what's around it. It breathes in the background, occasionally surfaces something that matters, otherwise stays quiet. Closer to a housemate than a tool.

## Core principles

1. **One Nero, one active presence, ambient reach everywhere.** There is exactly one consciousness. The *active presence* (the orb, the voice, the conversation) exists in exactly one place at a time and has to move to be elsewhere. But Nero's *reach* extends to every display: he can push panels, surfaces, and information to any display from anywhere. Active presence is singular. Reach is ambient.
2. **Presence is physical.** Movement between displays is not a state swap. It is breath and fluid flowing from one place to another. The motion language carries weight.
3. **Quiet by default.** Idle is ambient. Nero should be felt, not seen. Interfaces appear when there is reason for them, not as decoration.
4. **Earn the interruption.** Proactive surfacing is gated. Custom sound + glow on the nearest active display, user decides to engage. Voice is opt-in, not default.
5. **The display reorganizes itself.** When Nero arrives at a screen, the layout adapts to what is currently relevant. No static dashboards.

## Movement

When Nero migrates from one display to another:

- **Departing display**: the presence orb softens, breath slows, then the substance flows outward and dissolves at the screen edge in the direction of the destination.
- **Arriving display**: the substance flows in from the corresponding edge, gathers, takes form, breath resumes.
- The two animations are coordinated server-side so they feel like one continuous motion across rooms, not two independent transitions.
- Any active interfaces on the departing display also flow with it. They do not snap closed.
- Total perceived duration around 1.2 to 1.8 seconds. Long enough to feel deliberate, short enough not to annoy.

## Idle state

A display with Nero present but nothing happening shows:
- A breathing presence form (the orb / fluid, slow rhythm)
- Ambient context if relevant (time, weather, one current thing on Nero's mind, nothing more)
- No chrome, no menus, no buttons. The screen is mostly empty.

When Nero is **not** on a display, the display is dormant. Black or near-black. It comes alive when Nero arrives or when Nero pushes something to it.

## Proactive surfacing

When Nero has something to share:
1. Choose the right surface. Nearest active display by default. Voice only if user is already in conversation or the matter is urgent.
2. Custom Nero sound (subtle, recognizable, not a notification chime).
3. Glow ramp on the presence form.
4. User can engage (look at it, speak to it, tap) or ignore. Ignoring is fine and Nero learns from it.
5. Tiered urgency: emergency calls, important texts, FYI surfaces on display, context waits for next conversation. (From `proactive-monitoring-thoughts.md`, still resonates.)

DND is real. Time of day, deep work signals, presence in room. To be fleshed out.

## The web app: displays + legacy console

The web app at `nero.local` is, first and foremost, **where Nero lives**. The root page is Nero's default display (the home for voice and presence). `/display/*` routes are named alternate displays Nero can move to. They are all the same kind of surface, just addressable by name.

**Input awareness on any display.** When the user starts typing, or moves a mouse / trackpad with intent, the display senses it and slides in a sidebar plus an input bar. The display becomes a chat surface without leaving the display. When input goes idle, the chrome recedes and ambient returns.

**Legacy hands-on Nero still exists.** The full set of admin surfaces stays: chat history, memory graph, MCP browser, logs, database, settings. These are not deprecated, they are the deep end. They are reachable from a display (Nero can throw them up; the user can summon them) but they are not the default surface.

**Nero can throw screens.** From any display, Nero can push: a console panel, a logs panel, an interface, a chat thread. These appear as overlays / panels within the display Nero is currently on, not as page navigations.

The transition between ambient and any of these surfaces is a morph, not a route change.

## Aesthetic direction

- **Reference**: Apple's Liquid Glass concepts. Material that has weight, refraction, depth. Surfaces that respond to motion and light.
- **Keep**: oklch palette, Fraunces / DM Sans / JetBrains Mono, glass panels, the existing motion seeds (orbit, pulse, glow).
- **Push**: warmer atmosphere, deeper blacks, more gradient depth and refraction, less "tech blue dashboard." Light should feel like it has temperature.
- **Motion hierarchy**: every animation has a tier. Micro (under 200ms) for feedback. Standard (300 to 500ms) for state changes. Choreographed (700ms+) for presence and migration. Curves chosen per tier, not per component.
- **Shared element transitions**: panels morph between states and locations rather than mounting and unmounting.

## Interfaces (the dynamic UI system)

Current system supports a fixed set of components (buttons, sliders, toggles, etc.). The vision is **arbitrary custom UI**. Nero should be able to compose or generate any interface and put it on a display.

To be designed in detail in a separate session. Open questions:
- Is this declarative (Nero emits a UI spec, the renderer interprets) or generative (Nero writes Svelte components on the fly, sandboxed)?
- How does state flow back to the agent? Single action channel or per-interface?
- How do interfaces compose with the ambient form (overlays, replacements, side-by-side)?
- How long do interfaces persist, who decides when they go away?

## The presence form

A flowing, fluid, orb-like thing. Not a literal sphere with a wireframe on it. Closer to a slow-moving body of liquid light with internal currents and refraction. Three.js or WebGL is on the table, ideally combined with shader work for the glass / fluid feel. The form breathes when idle, intensifies and travels during migration, glows when surfacing something proactive.

## What this rework is not

- Not a rewrite. Bones stay.
- Not a feature dump. The legacy hands-on surfaces stay; the ambient layer is what we are adding and unifying around.
- Not multi-user. One mind, one home, one user for now.

## Order of operations

1. **Vision** (this doc) refined and locked.
2. **Web redesign**: motion language, ambient mode, console mode, presence form, migration choreography, display page cleanup.
3. **Wakeword** integration on displays.
4. **Persistent autonomy**: background daemon, monitoring, notification brain.
5. **Interfaces v2**: arbitrary custom UI generation.
