# Nero OSS Architecture

This document describes the system architecture, data flow, and component design of Nero OSS.

## System Overview

Nero is a multi-modal AI companion with terminal, voice, SMS, and web interfaces. It uses a modular agent-based architecture built on the Magma framework, with pluggable MCP servers for tool capabilities.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACES                                │
├──────────────┬──────────────┬──────────────┬──────────────┬─────────────────┤
│   Terminal   │    Voice     │     SMS      │    Web/API   │  Pompeii Chat   │
│   (CLI)      │   (Phone)    │  (Twilio)    │   (Service)  │   (Workspace)   │
└──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┴────────┬────────┘
       │              │              │              │                │
       └──────────────┴──────────────┴──────────────┴────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   Session Manager   │
                         │  (Context/History)  │
                         └──────────┬──────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   Nero Agent Core   │
                         │   (Magma Framework) │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────▼────────┐   ┌────────▼────────┐   ┌────────▼────────┐
     │  Memory System  │   │   Tool System   │   │  Autonomy System│
     │  (Graph + DB)   │   │  (MCP Servers)  │   │  (Scheduled)    │
     └─────────────────┘   └─────────────────┘   └─────────────────┘
```

## Core Components

### 1. Agent Core (`src/agent/`)

The central intelligence layer built on the Magma framework.

**Nero Agent** (`nero.ts`)
- Main orchestration layer
- Manages conversation state and tool execution
- Coordinates subagents for parallel tasks
- Integrates with all peripheral systems

**Subagent System** (`subagent.ts`)
- Dispatches parallel research/build tasks
- Supports two modes: `research` (read-only) and `build` (read-write)
- Manages independent tool contexts per subagent

### 2. Memory System (`src/graph/`, `src/models/`)

Multi-layered memory architecture for context retention.

| Layer | Storage | Purpose | Retention |
|-------|---------|---------|-----------|
| Conversation | PostgreSQL | Message history | Permanent |
| Working Memory | In-Memory | Current session context | Session |
| Long-term Memory | PostgreSQL + Embeddings | Facts, preferences, entities | Permanent |
| Graph Memory | PostgreSQL (graph table) | Entity relationships | Permanent |
| Summaries | PostgreSQL | Condensed session history | Permanent |

**Key Models:**
- `Message` - Conversation messages
- `Memory` - Extracted facts and preferences  
- `GraphNode` - Entities with vector embeddings
- `Summary` - Condensed session history

### 3. Tool System (`src/mcp/`)

Pluggable tool architecture via Model Context Protocol (MCP).

```
┌─────────────────────────────────────────────────────┐
│                  MCP Client                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │   Server 1  │ │   Server 2  │ │   Server N  │   │
│  │ (filesystem)│ │  (spotify)  │ │   (custom)  │   │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘   │
└─────────┼───────────────┼───────────────┼──────────┘
          │               │               │
    ┌─────▼──────┐ ┌──────▼─────┐ ┌──────▼─────┐
    │   Tools    │ │   Tools    │ │   Tools    │
    └────────────┘ └────────────┘ └────────────┘
```

**Transport Types:**
- `stdio` - Local process communication
- `sse` - Server-Sent Events for remote servers
- `http` - Streamable HTTP for modern MCP servers

### 4. Interface Layer (`src/interfaces/`, `src/cli/`)

Multi-modal user interaction layer.

**CLI** (`src/cli/`, `src/commands/`)
- Commander.js-based command structure
- Rich terminal UI with Ink (React-based)
- 20+ commands covering all functionality

**Voice** (`src/voice/`)
- Twilio integration for phone calls
- Hume AI for emotion detection
- Real-time audio streaming

**SMS** (`src/sms/`)
- Twilio SMS/MMS handling
- Message threading across channels

**Dynamic Displays** (`src/interfaces/`)
- HUD-style interface windows
- Real-time dashboard rendering
- Interactive controls

### 5. Autonomy System (`src/autonomy/`, `src/goals/`, `src/actions/`)

Self-directed operation capabilities.

**Scheduled Actions** (`src/actions/`)
- Cron-like scheduling with natural language
- Recurring patterns (daily, weekly, etc.)
- Background execution

**Goal Management** (`src/goals/`)
- Long-term goal tracking with milestones
- Task dependency chains
- Autonomous session eligibility

**Proactivity** (`src/proactivity/`)
- Pattern detection in user behavior
- Suggestive actions based on context
- Confidence thresholds for intervention

### 6. Service Layer (`src/service/`)

HTTP/WebSocket service for external integrations.

```
┌──────────────────────────────────────────────────────────┐
│                    Express Service                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │  WebSocket   │ │   REST API   │ │  Webhooks    │     │
│  │  (/ws)       │ │  (/v1/*)     │ │  (/webhook)  │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
└──────────────────────────────────────────────────────────┘
```

**Endpoints:**
- REST API for programmatic access
- WebSocket for real-time updates
- Webhooks for external integrations (Pompeii, etc.)

### 7. Tool Learning System (`src/tool-learning/`)

Institutional memory for tool outputs.

- Stores successful command outputs
- Semantic search across history
- Pattern detection for common operations
- Automatic recall in similar contexts

### 8. Multi-Agent Orchestration (`src/orchestration/`)

Director pattern for complex parallel tasks.

- **Planner**: Creates execution strategy
- **Specialists**: Domain-specific subagents
  - `CodeSpecialist`: Code generation/review
  - `DocsSpecialist`: Documentation tasks
  - `ResearchSpecialist`: Information gathering
  - `TestSpecialist`: Testing strategies
- **Message Bus**: Coordination between agents

## Data Flow

### Conversation Flow

```
User Input
    │
    ▼
┌─────────────────┐
│ Interface Layer │ (CLI/Voice/SMS/Web)
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Session Manager │────▶│  Detect Session │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Nero Agent    │◀────│  Load Context   │
│                 │     │  - Memories     │
│  ┌───────────┐  │     │  - Skills       │
│  │   LLM     │  │     │  - MCP Tools    │
│  │ (OpenAI/  │  │     └─────────────────┘
│  │ OpenRouter│  │
│  └───────────┘  │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌───────┐ ┌───────┐
│ Tool  │ │ Direct│
│ Call  │ │ Output│
└───┬───┘ └───┬───┘
    │         │
    ▼         │
┌─────────────────┐    ┌─────────────────┐
│   MCP Client    │───▶│ Execute on      │
│                 │    │ External Server │
└────────┬────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐    ┌─────────────────┐
│  Tool Learning  │───▶│ Store Output    │
│                 │    │ for Future Ref  │
└────────┬────────┘    └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Stream Response│────▶ User
└─────────────────┘
```

### Memory Ingestion Flow

```
Conversation
     │
     ▼
┌──────────────────┐
│ Extract Entities │──▶ People, Projects, Concepts
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Generate Embeddings│──▶ OpenAI text-embedding-3-small
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Graph Activation │──▶ Link to existing nodes or create new
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Store Memory     │──▶ PostgreSQL + pgvector
└──────────────────┘
```

### Autonomous Session Flow

```
Scheduled Trigger / Self-Initiated
              │
              ▼
    ┌─────────────────────┐
    │ Check Token Budget  │──▶ Abort if depleted
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Review Active Goals │──▶ Prioritize by deadline/priority
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Select Task         │──▶ Choose highest-value eligible task
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Execute Work        │──▶ Use tools, subagents as needed
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Update Progress     │──▶ Log to journal, update goal status
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │ Determine Sleep     │──▶ 15-120 min based on urgency
    └─────────────────────┘
```

## Module Reference

### Agent & Core
| Module | Purpose |
|--------|---------|
| `src/agent/nero.ts` | Main agent orchestration |
| `src/agent/subagent.ts` | Parallel task dispatch |
| `src/index.ts` | CLI entry point |

### Memory & Persistence
| Module | Purpose |
|--------|---------|
| `src/models/` | Database models (Message, Memory, Action, etc.) |
| `src/db/` | PostgreSQL connection & migrations |
| `src/graph/` | Graph memory operations |

### Tools & Capabilities
| Module | Purpose |
|--------|---------|
| `src/mcp/client.ts` | MCP server management |
| `src/skills/` | Skill loading and execution |
| `src/tool-learning/` | Tool output storage & recall |
| `src/browser/` | Web browser automation |

### Interfaces
| Module | Purpose |
|--------|---------|
| `src/commands/` | CLI command implementations |
| `src/cli/` | Terminal UI components |
| `src/voice/` | Phone call handling |
| `src/sms/` | SMS/MMS handling |
| `src/interfaces/` | Dynamic display system |

### Autonomy
| Module | Purpose |
|--------|---------|
| `src/actions/` | Scheduled action execution |
| `src/goals/` | Long-term goal management |
| `src/proactivity/` | Pattern detection & suggestions |
| `src/orchestration/` | Multi-agent coordination |
| `src/autonomy/` | Autonomous session logic |

### Services
| Module | Purpose |
|--------|---------|
| `src/service/` | HTTP/WebSocket service |
| `src/pompeii/` | Pompeii workspace integration |
| `src/slack/` | Slack integration |
| `src/relay/` | Connection relay for remote access |

### Utilities
| Module | Purpose |
|--------|---------|
| `src/util/` | General utilities |
| `src/config.ts` | Configuration management |
| `src/services/` | Session & process management |

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun (Node.js alternative) |
| Language | TypeScript |
| Agent Framework | @pompeii-labs/magma |
| LLM APIs | OpenAI, OpenRouter, Anthropic |
| Database | PostgreSQL + pgvector |
| Web Framework | Express.js |
| CLI Framework | Commander.js |
| Terminal UI | Ink (React for CLI) |
| MCP SDK | @modelcontextprotocol/sdk |
| Embeddings | OpenAI text-embedding-3-small |

## Extension Points

### Adding MCP Servers

```bash
nero mcp add <name> -- <command>
```

Servers are configured in `~/.nero/mcp.json` and dynamically loaded at runtime.

### Adding Skills

Skills are TypeScript files in `~/.nero/skills/` with metadata headers:

```typescript
/**
 * @skill:skill-name
 * @description: What this skill does
 */
```

### Adding Commands

Commands are registered in `src/index.ts` using the Commander.js pattern:

```typescript
program
  .command('my-command')
  .description('What it does')
  .action(handler);
```

## Security Considerations

- **API Keys**: Stored in `~/.nero/.env`, never committed
- **Destructive Operations**: Require explicit `--destructive` flag
- **Protected Branches**: Configurable list (default: `main`, `master`)
- **Database**: Local PostgreSQL with connection pooling
- **MCP Servers**: Sandboxed processes with limited permissions

## Performance Characteristics

| Operation | Typical Latency |
|-----------|----------------|
| Tool Discovery | 50-200ms |
| Simple LLM Query | 500ms-2s |
| Subagent Task | 2-10s |
| Memory Search | 10-50ms |
| MCP Tool Call | 100ms-5s (depends on server) |

## Deployment Options

1. **Local**: Direct execution with `bun .`
2. **Docker**: Containerized with `docker-compose up`
3. **Service Mode**: HTTP API with `nero service start`
4. **Binary**: Compiled executable with `bun build --compile`
