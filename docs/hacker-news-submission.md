# Show HN: Nero – An AI agent with actual agency

**What if your AI didn't just respond, but had its own projects?**

Nero is an open-source AI agent that can work autonomously while you're away. It maintains its own projects, writes journal entries about what it accomplished, and manages its own token budget. When you come back, it has something new to tell you.

But that's just one interface. Nero unifies context across terminal, web dashboard, voice calls, SMS, iOS, Slack, and even custom displays you mount around your house. Start a task on your laptop, continue on your phone, finish on a voice call—it remembers everything.

## What's different

Most AI tools are reactive assistants. Nero has **agency**:

- **Autonomy mode**: Works on projects independently, tracks progress across sessions, decides when to sleep and for how long
- **Knowledge graph memory**: Not chat history—a persistent graph of people, projects, concepts, and their relationships. Semantic search activates connected memories
- **Emotion detection**: During voice calls, analyzes vocal prosody in real-time (48 dimensions via Hume) and adapts responses to your emotional state
- **Dynamic interfaces**: Generates interactive UI panels and pushes them to any connected display (tablet, monitor, phone). Buttons, sliders, progress bars, live data
- **Multi-agent orchestration**: Spawns specialist subagents (Planner, Researcher, Implementer) that work in parallel on complex projects
- **Predictive actions**: Learns your patterns—checks deployment status after you push, alerts on issues before you ask

## Tech that matters

- **MCP-native**: First-class Model Context Protocol support. Add any MCP server in seconds—stdio or HTTP with OAuth
- **Self-hosted**: Runs entirely on your hardware. PostgreSQL for memory, your choice of LLM (OpenRouter, Ollama, vLLM)
- **LAN discovery**: `https://nero.local` works on any device. Auto-TLS, zero config
- **Real phone number**: Voice calls and SMS through Twilio integration (optional, requires license)
- **iOS app**: Native SwiftUI with 3D knowledge graph explorer, voice mode with neural sphere visualization

## Quick start

```bash
curl -fsSL https://raw.githubusercontent.com/pompeii-labs/nero-oss/main/install.sh | bash
```

That's it. Nero runs at `http://localhost:4848`. Every device on your LAN can reach it at `https://nero.local`.

## Why I built this

I kept hitting the same wall with AI assistants: they'd forget everything between sessions, couldn't work without me, and treated every interface as a separate conversation. I wanted an agent that felt like a colleague—someone who keeps working when I step away, remembers our entire history, and meets me wherever I happen to be.

The autonomy piece was the hardest. It's not a cron job. It's an agent that decides what to work on, does the work, and picks up where it left off. The first time I came back after a few hours and Nero said "I refactored that module we talked about and found three related issues," I knew this was different.

## What's in the repo

- Full TypeScript/Bun codebase
- CLI, web dashboard, iOS app
- Docker deployment (integrated or contained)
- 30+ built-in tools + MCP server support
- Example skills for code review, debugging, security audits
- Comprehensive docs and API reference

MIT licensed. Self-host for free. Optional license for voice/SMS webhooks.

---

**Links:**
- GitHub: https://github.com/pompeii-labs/nero-oss
- Docs: https://github.com/pompeii-labs/nero-oss/tree/main/docs
- iOS app: Included in repo

Would love feedback, especially from people building agentic systems. The autonomy and orchestration pieces are still evolving—curious what patterns others have found.
