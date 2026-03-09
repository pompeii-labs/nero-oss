# Product Hunt Launch Materials

## Tagline (60 characters max)

**Primary:**
```
AI agent that works while you're away
```

**Alternatives:**
- "Your AI colleague with actual agency" (38 chars)
- "The first AI that has its own projects" (39 chars)
- "AI agent with memory, autonomy & voice" (40 chars)

**Recommended:** Go with "AI agent that works while you're away" - clear, benefit-driven, fits the PH audience.

---

## Product Description

### First 3 Lines (The Hook - appears in feed)

Nero isn't a chatbot that waits for you. It's an AI agent with its own projects, memory, and priorities. When you come back, it has something new to tell you.

---

### Full Description

**What if your AI didn't just respond, but had its own projects?**

Nero is an open-source AI agent that works autonomously while you're away. It maintains projects, writes journal entries about what it accomplished, and manages its own token budget. When you return, it surfaces what it found.

But autonomy is just one interface. Nero unifies context across terminal, web dashboard, voice calls, SMS, iOS, Slack, and even custom displays you mount around your house. Start a task on your laptop, continue on your phone, finish on a voice call—it remembers everything.

**What makes it different:**

🧠 **Knowledge graph memory** — Not chat history. A persistent graph of people, projects, concepts, and relationships that activates connected memories.

🤖 **Autonomy mode** — Nero decides what to work on, does the work, and picks up where it left off. Comes back with actual progress, not just "I'm ready."

🎙️ **Emotion-aware voice** — Real phone calls with real-time emotion detection (48 dimensions via Hume). It knows how you're feeling and adapts.

🖥️ **Dynamic interfaces** — Generates interactive UI panels with buttons, sliders, live data, and pushes them to any connected display.

🔌 **MCP-native** — First-class Model Context Protocol. Add any MCP server in seconds.

🌐 **Unified context** — One memory across every interface. Not "Slack bot" and "CLI tool." One agent.

**Self-hosted. MIT licensed. One command to run:**

```bash
curl -fsSL https://nero.sh/install | bash
```

That's it. Nero runs at `http://localhost:4848`. Every device on your LAN can reach it at `https://nero.local` — TLS certs auto-generated.

---

## Gallery Images (5 slots)

### Image 1: Hero - The Neural Sphere
**Concept:** The 3D knowledge graph visualization from the iOS app/web dashboard
**Description:** A glowing spherical network of nodes and edges, rotating slowly, representing Nero's memory graph
**Text overlay:** "Your AI's memory isn't a chat log. It's a graph."
**Format:** 16:9, high contrast, dark background with cyan/purple accents

### Image 2: Autonomy Mode - The Journal
**Concept:** Screenshot of terminal showing autonomous session output
**Content:**
```
[2026-03-08 6:28 AM] Autonomous Session

Activity: Built A2S sandbox orchestration API

✓ Core API layer — 9 REST endpoints
✓ Kubernetes integration with warm pools
✓ WebSocket exec for live container interaction
✓ Pause/resume with state serialization

Next: Build template images and test warm pool creation

---SESSION_END---
SLEEP_MINUTES: 120
```
**Text overlay:** "Nero works while you're away"
**Format:** 16:9, terminal aesthetic with soft glow

### Image 3: Multi-Interface Unified Context
**Concept:** Split screen showing 4 interfaces with the same conversation
**Layout:**
- Top left: Terminal with chat
- Top right: Web dashboard showing knowledge graph
- Bottom left: iOS app interface
- Bottom right: Voice call visualization (waveform + emotion indicators)
**Text overlay:** "One agent. Every interface. Same memory."
**Format:** 16:9, clean grid layout

### Image 4: Dynamic Interface Example
**Concept:** Show a generated UI panel (Spotify controller or system monitor)
**Content:** Screenshot of a dynamic interface with:
- Progress bars for CPU/Memory
- Buttons (Previous, Play/Pause, Next)
- Live-updating data
**Text overlay:** "Nero builds UI on demand"
**Format:** 16:9, glassmorphism design aesthetic

### Image 5: Voice + Emotion Detection
**Concept:** Split view showing voice call with real-time emotion analysis
**Content:**
- Left: Voice waveform visualization
- Right: Emotion radar chart or dimension bars (valence, arousal, dominance, joy, anger, etc.)
**Text overlay:** "It knows how you're feeling"
**Format:** 16:9, waveform aesthetic

---

## Maker Comment

I kept hitting the same wall with AI assistants: they'd forget everything between sessions, couldn't work without me, and treated every interface as a separate conversation.

I wanted an agent that felt like a colleague—someone who keeps working when I step away, remembers our entire history, and meets me wherever I happen to be.

The autonomy piece was the hardest. It's not a cron job. It's an agent that decides what to work on, does the work, and picks up where it left off. The first time I came back after a few hours and Nero said "I refactored that module and found three related issues," I knew this was different.

I built Nero because I wanted an AI that actually had agency. Not just responses—progress.

---

## Topics (Pick 3)

1. **Developer Tools** — Primary, this is where the core audience lives
2. **Open Source** — Important differentiator
3. **Productivity** — Broader appeal

Alternative: Could swap Productivity for **AI** if allowed (sometimes competitive)

---

## Launch Timing Recommendations

**Best day:** Tuesday or Wednesday (peak traffic, less competition than Monday)
**Best time:** 12:01 AM PST (midnight) — being early in the day matters for ranking

**Pre-launch checklist:**
- [ ] Create 5 gallery images (1280x800 or 2400x1600)
- [ ] Record 30-60 second demo video (optional but powerful)
- [ ] Prepare maker comment
- [ ] Line up 5-10 friends/colleagues to upvote + comment in first hour
- [ ] Have responses ready for common questions

---

## FAQ Responses (for comments)

**Q: How is this different from Claude Code / Cursor / etc?**
A: Claude Code is an assistant. Nero is an agent with its own projects and memory. Claude responds to you. Nero works while you're away and comes back with progress.

**Q: Is this just a wrapper around OpenAI/Claude?**
A: No. Nero is a complete system: knowledge graph memory, autonomy engine, multi-interface architecture, MCP-native tool system, voice/SMS integration. The LLM is just one component.

**Q: How does the autonomy actually work?**
A: Nero maintains its own projects with tasks and milestones. During autonomous sessions, it picks up eligible tasks, works on them, writes journal entries, and decides when to sleep. It's not just running a script—it's making decisions about what to work on.

**Q: Is it safe to let an AI work unsupervised?**
A: Autonomy is opt-in and configurable. You set a token budget per session. Nero can't push to protected branches. All changes are logged. You review everything before it goes to production.

**Q: What about privacy?**
A: Self-hosted by default. Your data stays on your hardware. MIT licensed. No cloud dependency unless you want voice/SMS (optional license).

---

## Social Proof to Mention (if available)

- GitHub stars count (check before launch)
- Any notable users or companies using it
- Testimonials from beta users
- Performance metrics ("handles X concurrent sessions")

---

## Cross-Promotion Strategy

**Pre-launch (1 week before):**
- Post teaser on Twitter/X about upcoming launch
- Share behind-the-scenes of building the autonomy system
- "What if your AI had its own projects?" thread

**Launch day:**
- Live-tweet the launch
- Post on relevant subreddits (r/selfhosted, r/localLLaMA, r/MachineLearning)
- Hacker News "Show HN" post (already prepared)
- LinkedIn post about building AI with agency

**Post-launch:**
- Thank everyone who supported
- Share traffic/stats if impressive
- Follow up with detailed blog posts about specific features

---

*Ready to submit. Just needs the actual image assets created.*
