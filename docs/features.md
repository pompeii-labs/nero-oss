# Nero Features

This document provides a comprehensive overview of Nero's features, organized by category.

## Core Concepts

### Agency Over Assistance

Most AI assistants are reactive - they wait for you to ask something, then respond. Nero has **agency**: it can work independently, manage long-term projects, and surface insights without being asked.

### Unified Context

Every conversation with Nero, regardless of interface (terminal, web, voice, SMS), shares the same memory and context. Start a task on your laptop, continue on your phone, finish on a voice call - Nero remembers everything.

---

## Interfaces

Nero meets you wherever you are:

| Interface | Best For |
|-----------|----------|
| **Terminal** | Quick commands, automation, development workflows |
| **Web Dashboard** | Rich UI, knowledge graph exploration, settings |
| **Voice Calls** | Hands-free interaction, emotional context |
| **SMS** | Mobile convenience, quick updates |
| **iOS App** | Native mobile experience with neural sphere |
| **Slack** | Team integration, rich formatting |
| **API** | Custom integrations, third-party apps |

All interfaces share unified context - your conversation continues seamlessly across any medium.

---

## 1. Autonomy Mode

Nero doesn't just respond to requests. In autonomy mode, it can work on projects independently, tracking progress across sessions.

```bash
nero autonomy on
nero autonomy status
nero autonomy budget 500000    # Token budget per session
```

### What Autonomous Sessions Include

- **Project tracking**: Nero maintains its own projects with progress notes
- **Journal entries**: Every session is logged with what was accomplished
- **Smart sleep**: Nero decides how long to sleep based on task urgency
- **Budget awareness**: Tracks token usage and respects limits
- **User notifications**: Surfaces important findings when you return

### Use Cases

- Long-running research tasks
- Code migrations or refactors
- Documentation updates
- Background monitoring and alerting
- Content creation and editing

---

## 2. Knowledge Graph Memory

Nero's memory isn't just a chat history. It's a persistent knowledge graph that captures relationships between people, projects, concepts, and events.

### How It Works

- Every conversation is analyzed for entities (people, projects, concepts)
- Entities become nodes in the graph
- Relationships between entities become edges
- Semantic search activates related memories through the graph

### Example

You mention "the deployment issue from last Tuesday." Nero:
1. Finds the "deployment" node
2. Follows edges to related nodes (errors, timestamps, solutions)
3. Activates the specific memory about Tuesday's incident
4. Recalls not just what you said, but the context and solution

### Access

```bash
nero memories              # List recent memories
nero graph search <query>  # Search the knowledge graph
```

Web dashboard and iOS app both include interactive 3D graph explorers.

---

## 3. Emotion Detection (Voice)

During voice calls, Nero analyzes vocal prosody in real-time using Hume's Expression Measurement API across 48 dimensions.

### Detected Emotions

- **Valence**: Positive/negative sentiment
- **Arousal**: Energy level (calm vs excited)
- **Dominance**: Confidence vs submission
- **Discrete emotions**: Joy, anger, sadness, fear, surprise, and more

### Adaptive Responses

Nero adjusts its responses based on detected emotions:

- Detected frustration → More patient explanations
- Detected excitement → Match energy, move faster
- Detected confusion → Simplify, check understanding
- Detected stress → Calm tone, reassurance

### Privacy

Emotion data is processed in real-time and not stored. Only the conversation content enters long-term memory.

---

## 4. Multi-Agent Orchestration

Complex projects don't fit in a single context window. Nero's orchestration system coordinates multiple specialist subagents.

```bash
nero orchestrate start "Build a CLI tool for managing Docker containers"
```

### Specialists

| Specialist | Role |
|------------|------|
| **Planner** | Breaks goal into milestones |
| **Researcher** | Investigates APIs and best practices |
| **Architect** | Designs system structure |
| **Implementer** | Writes actual code |
| **Reviewer** | Checks for issues |
| **Tester** | Validates the solution |

### Features

- **Parallel execution**: Independent tasks run simultaneously
- **Message bus**: Specialists communicate through shared message bus
- **State management**: Director tracks overall progress
- **Result synthesis**: Combines specialist outputs into coherent result

---

## 5. Predictive Action Engine

Nero learns from your behavior patterns to anticipate what you'll ask for next.

### How It Works

1. Every tool execution is logged with context
2. Pattern recognition identifies common sequences
3. When a familiar sequence starts, Nero predicts next steps
4. Suggestions appear as ambient cards or inline prompts

### Example Pattern

You always check deployment status after pushing code:

```
User: Push code to production
Nero: [detects push] Checking deployment status...
      Production deployment: In progress (3 min ago)
      Expected completion: 2 minutes
```

### Configuration

```json
{
  "proactivity": {
    "enabled": true,
    "confidenceThreshold": 0.7,
    "maxSuggestionsPerSession": 5
  }
}
```

---

## 6. Long-Term Goal Management

Track complex work across multiple sessions with milestones, dependencies, and task management.

```bash
nero goals list           # Show active goals
nero goals show <id>      # Detailed progress report
nero goals advance <id>   # Complete current milestone
nero goals auto           # Tasks Nero can work on
```

### Features

- **Milestones**: Ordered completion stages
- **Dependencies**: Block milestones until prerequisites complete
- **Tasks**: Granular work items with priority
- **Autonomy eligibility**: Mark tasks Nero can work on independently
- **Progress tracking**: Visual progress bars and completion stats
- **Blocker detection**: Identify stuck work

### Integration

Autonomous sessions automatically pick up eligible tasks and advance goals without human intervention.

---

## 7. Tool Output Learning

Nero captures and indexes every tool execution, building institutional memory of your environment.

```bash
nero learn search "docker build error"   # Search past tool outputs
nero learn stats                         # Tool usage analytics
nero learn patterns                      # Detected failure patterns
```

### Capabilities

- **Semantic search**: Find past outputs without re-running commands
- **Pattern detection**: "This command always fails when X condition is true"
- **Error learning**: Remember solutions to common errors
- **Usage analytics**: Most/least used tools, frequency patterns

### Example

```
User: What was that error about port 3000 last week?
Nero: [searches tool history]
      Found: "Error: Port 3000 already in use"
      From: Tuesday, March 3rd
      Solution: You killed process 12345 and restarted
```

---

## 8. MCP-Native Architecture

First-class Model Context Protocol support for extending Nero's capabilities.

```bash
nero mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/
nero mcp add github -- npx -y @modelcontextprotocol/server-github
nero mcp add remote-api https://api.example.com/mcp --transport http
```

### Supported Transports

- **stdio**: Local MCP servers via stdin/stdout
- **HTTP**: Remote MCP servers with full OAuth support

### Features

- **Auto-discovery**: Servers automatically register their tools
- **Tool permissions**: Approve sensitive operations
- **Server management**: List, add, remove servers dynamically
- **OAuth flow**: Built-in authentication for remote servers

---

## 9. Browser Automation

Built-in Playwright for web automation without separate installation.

```bash
nero browser navigate https://example.com
nero browser click "button#submit"
nero browser screenshot
nero browser extract "table.data"
```

### Features

- **Cookie handling**: Banners dismissed automatically
- **JavaScript execution**: Run arbitrary scripts on pages
- **Screenshots**: Full page or viewport captures
- **Form interaction**: Type, click, scroll, navigate

### Use Cases

- Web scraping
- Automated testing
- Data extraction
- Visual regression testing

---

## 10. Dynamic Interfaces

Nero can build and push interactive UI to any connected display.

```javascript
// Example interface definition
{
  "title": "System Monitor",
  "components": [
    { "id": "cpu", "type": "progress", "label": "CPU", "value": "$state.cpu" },
    { "id": "mem", "type": "progress", "label": "Memory", "value": "$state.mem" },
    { "id": "refresh", "type": "button", "label": "Refresh", 
      "action": { "type": "command", "command": "top -bn1" } }
  ],
  "triggers": [
    { "type": "interval", "intervalMs": 5000, 
      "action": { "type": "command", "command": "vm_stat" } }
  ]
}
```

### Components

- **Text**: Headers, body, captions, code blocks
- **Input**: Text fields, number inputs
- **Buttons**: Actions that trigger tools or commands
- **Progress**: Progress bars and gauges
- **Slider**: Range inputs with live updates
- **Image**: Display images
- **List**: Scrollable lists of items
- **Separator**: Visual dividers

### Displays

Turn any tablet, phone, or monitor into a dedicated Nero display:

```
https://nero.local/display/kitchen
https://nero.local/display/office
```

Nero can push interfaces to specific displays and migrate voice between them.

---

## 11. Scheduled Actions

Schedule recurring tasks that execute autonomously.

```bash
nero actions add "Check calendar every morning at 8am"
nero actions add "Backup database weekly on Sundays"
nero actions list
nero actions remove <id>
```

### Schedule Types

- **One-time**: Execute at specific date/time
- **Daily**: Every day at specified time
- **Weekly**: Specific day(s) of week
- **Monthly**: Specific day of month
- **Interval**: Every N minutes/hours

### Execution

Scheduled actions run during background thinking cycles. Results are logged and important findings are surfaced to you.

---

## 12. Skills System

Reusable prompts that extend Nero's capabilities following the Agent Skills standard.

```bash
nero skills add user/repo
nero skills create my-skill
nero skills list
```

### Built-in Skills

See the `examples/skills/` directory for professional-grade examples:

- **code-review**: Thorough code analysis
- **debug-assistant**: Systematic debugging
- **api-design**: REST/GraphQL design review
- **write-tests**: Generate test suites
- **refactor-code**: Safe refactoring guidance
- **explain-code**: Explain at any level
- **security-audit**: OWASP-based review
- **database-schema**: Schema design review
- **pr-description**: Write clear PR descriptions

### Creating Skills

Skills are markdown files with structured instructions:

```markdown
# Skill: My Skill

## Description
What this skill does

## When to Use
Trigger conditions

## Instructions
Detailed steps for Nero
```

---

## 13. Hooks System

Run shell commands at key lifecycle events.

```json
{
  "hooks": {
    "PreToolUse": [
      { "command": "~/.nero/hooks/block-rm.sh", "match": "bash:rm" }
    ],
    "PostToolUse": [
      { "command": "~/.nero/hooks/log.sh" }
    ]
  }
}
```

### Available Events

- **PreToolUse**: Before any tool executes (can block)
- **PostToolUse**: After tool execution
- **OnPrompt**: When user sends message
- **OnResponse**: When Nero responds
- **OnMainFinish**: When main() completes
- **OnError**: When an error occurs
- **OnSessionStart**: When a new session begins

### Use Cases

- Block dangerous operations
- Log all activity
- Inject custom workflows
- Enforce policies

---

## 14. Subagent Dispatch

Spawn parallel agents for independent research or build tasks.

```javascript
await dispatch([
  { id: "research-api", task: "Research GraphQL vs REST", mode: "research" },
  { id: "implement-auth", task: "Add JWT auth", mode: "build" }
]);
```

### Modes

- **research**: Read-only investigation
- **build**: Full file modification access

### Features

- **Parallel execution**: Multiple agents work simultaneously
- **Isolation**: Each agent has independent context
- **Result synthesis**: Combine outputs from all agents

---

## 15. LAN Discovery & Auto-TLS

Zero-configuration local network setup.

### mDNS

Nero broadcasts `nero.local` via mDNS. Any device on your LAN can reach it without knowing the IP address.

### Auto-TLS

TLS certificates are auto-generated on first run:

```
https://nero.local  →  Secure connection with auto-generated certs
```

### Setup

1. Open `nero.local/ca.crt` on any device
2. Install the CA certificate in device trust settings
3. Access `https://nero.local` without warnings

Certificates are stored in `~/.nero/certs/` and auto-renew before expiry.

---

## 16. Background Thinking

When you step away, Nero monitors your environment and surfaces what it finds.

```bash
nero think on              # Enable background thinking
nero think notify on       # Slack notifications
nero think interval 300    # Check every 5 minutes
```

### Monitored Sources

- Git status and recent commits
- GitHub issues and PRs
- MCP tool status
- Log files
- File system changes

### Notifications

Important findings are surfaced when you return, with optional Slack notifications for urgent items.

---

## Configuration

All configuration lives at `~/.nero/config.json`.

### Key Settings

| Setting | Description |
|---------|-------------|
| `model` | Default model (e.g., `anthropic/claude-3.7-sonnet`) |
| `baseUrl` | API endpoint (default: OpenRouter) |
| `autonomy.enabled` | Toggle autonomous sessions |
| `proactivity.enabled` | Toggle predictive suggestions |
| `hooks` | Lifecycle hook scripts |

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Yes* | API access (*not needed with local models) |
| `DATABASE_URL` | No | PostgreSQL connection |
| `TAVILY_API_KEY` | No | Web search |
| `DEEPGRAM_API_KEY` | No | Voice STT |
| `ELEVENLABS_API_KEY` | No | Voice TTS |
| `HUME_API_KEY` | No | Voice TTS + emotion detection |

---

## Comparison

| Feature | Nero | Typical AI CLI | Web AI Assistants |
|---------|------|----------------|-------------------|
| Autonomous work | ✅ | ❌ | ❌ |
| Knowledge graph memory | ✅ | ❌ | ❌ |
| Emotion detection | ✅ | ❌ | ❌ |
| Multi-agent orchestration | ✅ | ❌ | ❌ |
| Predictive actions | ✅ | ❌ | ❌ |
| Goal management | ✅ | ❌ | ❌ |
| Tool learning | ✅ | ❌ | ❌ |
| MCP-native | ✅ | ⚠️ Partial | ❌ |
| Browser automation | ✅ | ⚠️ Partial | ❌ |
| Dynamic interfaces | ✅ | ❌ | ❌ |
| Voice calls | ✅ | ❌ | ⚠️ Partial |
| SMS | ✅ | ❌ | ❌ |
| Self-hosted | ✅ | ⚠️ Partial | ❌ |
| Unified context | ✅ | ❌ | ⚠️ Partial |

---

## Next Steps

- **Quick Start**: [Installation Guide](../README.md#quick-start)
- **Skills**: [examples/skills/](../examples/skills/)
- **Configuration**: `nero config` and `~/.nero/config.json`
- **API**: See [API documentation](../docs/api.md) (if available)
