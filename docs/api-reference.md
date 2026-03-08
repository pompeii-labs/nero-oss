# API Reference

Complete reference for Nero's CLI commands, HTTP endpoints, and programmatic APIs.

---

## Table of Contents

- [CLI Commands](#cli-commands)
- [HTTP API](#http-api)
- [Programmatic API](#programmatic-api)
- [Environment Variables](#environment-variables)

---

## CLI Commands

Nero provides a comprehensive CLI for interaction, configuration, and management.

### Global Usage

```bash
nero <command> [options]
```

### Command Reference

#### `chat` (Default)

Start an interactive chat session with Nero.

```bash
nero chat [options]
nero [options]              # Default command
```

**Options:**

| Option | Description |
|--------|-------------|
| `-m, --message <message>` | Send a single message and exit |
| `-p, --pipe` | Read message from stdin (pipe mode) |
| `--dangerous` | Auto-approve all tool actions, verbose output |

**Examples:**

```bash
# Interactive mode
nero chat

# Single message
nero -m "What's the weather today?"

# Pipe mode
echo "Summarize this file" | nero -p

# Dangerous mode (auto-approve)
nero --dangerous -m "Delete old logs"
```

**Environment:** `NERO_DANGEROUS=1` enables dangerous mode globally.

---

#### `env` - Environment Management

Manage environment variables stored in `~/.nero/.env`.

```bash
nero env <subcommand>
```

**Subcommands:**

##### `env list`

List all environment variables.

```bash
nero env list [--show-values]
```

| Option | Description |
|--------|-------------|
| `--show-values` | Display full values instead of masking |

##### `env get <key>`

Get a specific environment variable.

```bash
nero env get OPENAI_API_KEY [--show-value]
```

##### `env set <key> <value>`

Set an environment variable.

```bash
nero env set OPENAI_API_KEY sk-xxx
```

##### `env unset <key>`

Remove an environment variable.

```bash
nero env unset OPENAI_API_KEY
```

---

#### `setup` - Installation & Setup

Interactive setup for the Nero Docker container.

```bash
nero setup [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--name <name>` | `nero` | Container name |
| `--port <port>` | `4848` | Service port |
| `--db` | - | Include local PostgreSQL database |
| `--integrated` | ✓ | Full host access mode |
| `--contained` | - | Standalone mode (no host mounts) |
| `--browser` | - | Include browser automation (Chromium) |
| `--image <image>` | `nero:latest` | Custom Docker image |
| `--pull` | - | Pull latest image before starting |

**Examples:**

```bash
# Interactive setup
nero setup

# Quick setup with database and browser
nero setup --db --browser

# Contained mode (isolated)
nero setup --contained --name nero-isolated
```

---

#### `license` - License Management

Manage Nero license for voice/SMS features.

```bash
nero license <subcommand>
```

##### `license get` (Default)

Open the license management page.

```bash
nero license get
```

##### `license register`

Register your tunnel URL with a license key.

```bash
nero license register -k <key> [-u <url>]
```

| Option | Description |
|--------|-------------|
| `-k, --key <key>` | License key (or `NERO_LICENSE_KEY` env var) |
| `-u, --url <url>` | Tunnel URL (auto-detected if not provided) |

##### `license status`

Check license status.

```bash
nero license status [-k <key>]
```

---

#### `logs` - Service Logs

View service logs.

```bash
nero logs [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `-n, --lines <number>` | `50` | Number of lines to show |
| `-l, --level <level>` | - | Filter by level (DEBUG, INFO, WARN, ERROR) |
| `-f, --follow` | - | Stream logs in real-time |

**Environment:** `NERO_SERVICE_URL` (default: `http://localhost:4847`)

---

#### `autonomy` - Autonomous Mode

Manage autonomous operation settings.

```bash
nero autonomy <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `on`, `enable` | Enable autonomous mode |
| `off`, `disable` | Disable autonomous mode |
| `status` | Show autonomy status and settings |
| `budget <tokens>` | Set daily token budget (0 = unlimited) |
| `destructive <on\|off>` | Allow/block destructive actions |
| `sleep <min> <max>` | Set sleep range between sessions (minutes) |
| `notify <on\|off>` | Toggle notifications for urgent findings |

**Examples:**

```bash
# Enable autonomy
nero autonomy on

# Set 100K token daily budget
nero autonomy budget 100000

# Configure 30-60 min sleep range
nero autonomy sleep 30 60
```

---

#### `think` - Background Thinking

Manage background thinking settings.

```bash
nero think <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `on`, `enable` | Enable background thinking |
| `off`, `disable` | Disable background thinking |
| `status` | Show background thinking status |
| `notify <on\|off>` | Toggle notifications for urgent thoughts |
| `destructive <on\|off>` | Allow/block destructive actions |

---

#### `skills` - Skill Management

Manage Nero's specialized skills.

```bash
nero skills <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `list` | List available skills |
| `load <name>` | Load a skill into context |
| `unload <name>` | Unload a skill |

**Examples:**

```bash
nero skills list
nero skills load dialog
nero skills unload dialog
```

---

#### `mcp` - MCP Server Management

Manage Model Context Protocol servers.

```bash
nero mcp <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `list` | List configured MCP servers |
| `add <name> <command>` | Add a new MCP server |
| `remove <name>` | Remove an MCP server |
| `auth <name>` | Authenticate with OAuth MCP server |

**Examples:**

```bash
# Add filesystem MCP server
nero mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem ~/

# Add with environment variables
nero mcp add github -- npx -y @modelcontextprotocol/server-github -e GITHUB_TOKEN=xxx

# Add remote HTTP server
nero mcp add remote-api https://mcp.example.com --transport http
```

---

#### `relay` - Relay/Tunnel Management

Manage ngrok/Cloudflare tunnels for external access.

```bash
nero relay <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `start` | Start relay tunnel |
| `stop` | Stop relay tunnel |
| `status` | Show relay status |
| `url` | Get tunnel URL |

---

#### `service` - Service Management

Manage the Nero service container.

```bash
nero service <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `start` | Start the service |
| `stop` | Stop the service |
| `restart` | Restart the service |
| `status` | Show service status |

---

#### `config` - Configuration

Manage Nero configuration.

```bash
nero config <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `get <key>` | Get configuration value |
| `set <key> <value>` | Set configuration value |
| `list` | List all configuration |

---

#### `export-import` - Data Management

Export and import Nero data.

```bash
nero export [path]
nero import <path>
```

---

#### `actions` - Scheduled Actions

Manage scheduled actions.

```bash
nero actions <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `list` | List scheduled actions |
| `add <timestamp> <request>` | Add scheduled action |
| `remove <id>` | Remove scheduled action |

---

#### `models` - Model Management

Manage LLM models and providers.

```bash
nero models <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `list` | List available models |
| `set <model>` | Set active model |
| `providers` | List configured providers |

---

#### `orchestrate` - Multi-Agent Orchestration

Start multi-agent orchestration sessions.

```bash
nero orchestrate <goal>
```

**Example:**

```bash
nero orchestrate "Build a REST API for user management"
```

---

#### `goals` - Goal Management

Manage long-term goals and projects.

```bash
goals <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `list` | List all goals |
| `create <title>` | Create a new goal |
| `show <id>` | Show goal details |
| `update <id>` | Update goal |
| `complete <id>` | Mark goal as complete |
| `delete <id>` | Delete goal |

---

#### `patterns` - Pattern Management

Manage conversation patterns.

```bash
nero patterns <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `list` | List patterns |
| `add <name>` | Add new pattern |
| `remove <name>` | Remove pattern |

---

#### `tool-learning` - Tool Learning

Manage learned tool usage patterns.

```bash
nero tool-learning <subcommand>
```

| Subcommand | Description |
|------------|-------------|
| `list` | List learned patterns |
| `clear` | Clear all learned patterns |

---

## HTTP API

Nero exposes an HTTP API for external integrations and the web interface.

### Base URL

```
http://localhost:4847/api
```

Configure with `NERO_SERVICE_URL` environment variable.

### Authentication

Most endpoints require no authentication (local service). MCP OAuth endpoints handle their own auth flow.

---

### Logs

#### GET `/api/logs`

Get recent log entries.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `lines` | number | 100 | Number of entries to return |
| `level` | string | - | Filter by level (DEBUG, INFO, WARN, ERROR) |
| `source` | string | - | Filter by source |

**Response:**

```json
{
  "count": 42,
  "logFile": "/path/to/logs/app.log",
  "entries": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "level": "INFO",
      "source": "Agent",
      "message": "Processing request..."
    }
  ]
}
```

#### GET `/api/logs/stream`

Server-Sent Events stream of live logs.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `level` | string | Minimum log level to stream |

---

### Memories

#### GET `/api/memories`

Get recent memories.

**Response:**

```json
{
  "memories": [
    {
      "id": "uuid",
      "body": "Memory content",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

#### POST `/api/memories`

Create a new memory.

**Request Body:**

```json
{
  "body": "Memory content string"
}
```

#### DELETE `/api/memories/:id`

Delete a memory by ID.

---

### MCP Servers

#### GET `/api/mcp/servers`

List all configured MCP servers with their tools and auth status.

**Response:**

```json
{
  "servers": [
    {
      "name": "filesystem",
      "config": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
        "transport": "stdio",
        "disabled": false
      },
      "tools": ["read_file", "write_file"],
      "authenticated": true
    }
  ]
}
```

#### POST `/api/mcp/servers`

Add a new MCP server.

**Request Body:**

```json
{
  "name": "filesystem",
  "config": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home"],
    "transport": "stdio",
    "disabled": false
  }
}
```

#### DELETE `/api/mcp/servers/:name`

Remove an MCP server.

#### POST `/api/mcp/servers/:name/toggle`

Enable or disable an MCP server.

---

### Settings

#### GET `/api/settings`

Get sanitized configuration (excludes secrets).

**Response:**

```json
{
  "model": "anthropic/claude-3.5-sonnet",
  "baseUrl": "https://openrouter.ai/api/v1",
  "autonomy": {
    "enabled": true,
    "budget": 100000
  },
  "thinking": {
    "enabled": false
  }
}
```

#### PUT `/api/settings`

Update settings.

#### GET `/api/settings/model`

Get LLM model settings.

#### PUT `/api/settings/model`

Update LLM model.

**Request Body:**

```json
{
  "model": "anthropic/claude-3.5-sonnet",
  "baseUrl": "https://openrouter.ai/api/v1"
}
```

#### GET `/api/settings/general`

Get general settings.

#### PUT `/api/settings/general`

Update general settings.

---

### OAuth

#### POST `/api/oauth/initiate`

Start OAuth flow for an MCP server.

#### GET `/api/oauth/callback`

OAuth callback handler.

#### GET `/api/oauth/status`

Check OAuth status for a server.

---

### Skills

#### GET `/api/skills`

List available skills.

#### GET `/api/skills/:name`

Get skill content.

#### POST `/api/skills/:name/load`

Load a skill into context.

#### DELETE `/api/skills/:name`

Unload a skill.

---

### Health & Status

#### GET `/api/context`

Get context window usage.

**Response:**

```json
{
  "tokens": 1500,
  "limit": 128000,
  "percentage": 1.17,
  "mcpTools": ["read_file", "write_file", "execute_command"]
}
```

#### GET `/api/usage`

Get OpenRouter usage (OpenRouter provider only).

**Response:**

```json
{
  "data": {
    "total_credits": 100.00,
    "total_usage": 45.23
  }
}
```

#### GET `/api/history`

Get message history.

#### POST `/api/reload`

Reload configuration.

#### GET `/api/update-check`

Check for new releases.

---

### Interfaces

#### GET `/api/interfaces`

List active interfaces.

#### POST `/api/interfaces`

Create a new interface.

#### GET `/api/interfaces/:id`

Get interface details.

#### PATCH `/api/interfaces/:id`

Update an interface.

#### DELETE `/api/interfaces/:id`

Close an interface.

#### POST `/api/interfaces/:id/action`

Execute an interface action.

#### GET `/api/interfaces/:id/events`

SSE stream of interface events.

---

### Data Management

#### POST `/api/export`

Export all data.

**Response:** Download link or file.

#### POST `/api/import`

Import data from file.

#### POST `/api/import/validate`

Validate import file without importing.

---

## Programmatic API

Nero exports a TypeScript API for building extensions and integrations.

### Installation

```bash
npm install @nero-ai/core
```

### Interface Management

Create and manage dynamic UI interfaces.

```typescript
import { InterfaceManager } from '@nero-ai/core/interfaces';

const manager = new InterfaceManager();

// Create an interface
const iface = manager.create({
  title: 'My Dashboard',
  width: 400,
  height: 300,
  components: [
    { type: 'text', content: 'Status: Online' },
    {
      type: 'button',
      label: 'Refresh',
      action: { type: 'command', command: 'echo refreshed' }
    }
  ]
});

// Update state
manager.updateState(iface.id, 'status', 'Active');

// Subscribe to events
const unsubscribe = manager.subscribe(iface.id, (event) => {
  console.log('Event:', event.type);
});

// Close interface
manager.close(iface.id);
```

#### InterfaceManager Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `(schema) => NeroInterface` | Create new interface |
| `get` | `(id) => NeroInterface \| undefined` | Get by ID |
| `update` | `(id, patch) => void` | Update interface |
| `close` | `(id) => void` | Close interface |
| `list` | `() => NeroInterface[]` | List all interfaces |
| `subscribe` | `(id, callback) => () => void` | Subscribe to events |
| `subscribeGlobal` | `(callback) => () => void` | Subscribe to all events |
| `updateState` | `(id, key, value) => void` | Update state value |
| `moveToDevice` | `(id, deviceName) => boolean` | Move to display |

#### Component Types

```typescript
type NeroComponent =
  | { type: 'text'; content: string; variant?: 'heading' | 'body' | 'caption' | 'mono' }
  | { type: 'button'; label: string; action: InterfaceAction; variant?: 'primary' | 'destructive' }
  | { type: 'toggle'; label: string; stateKey: string; action: InterfaceAction }
  | { type: 'slider'; label: string; min: number; max: number; stateKey: string; action: InterfaceAction }
  | { type: 'text-input'; placeholder: string; stateKey: string; action: InterfaceAction }
  | { type: 'select'; stateKey: string; options: Array<{label: string; value: string}>; action: InterfaceAction }
  | { type: 'progress'; value: number; max?: number; label?: string }
  | { type: 'image'; src: string; alt?: string }
  | { type: 'list'; items: string[]; variant?: 'ordered' | 'unordered' | 'none' }
  | { type: 'grid'; columns: number; children: NeroComponent[] }
  | { type: 'flex'; direction: 'row' | 'column'; children: NeroComponent[] };
```

#### Actions

```typescript
type InterfaceAction =
  | { type: 'tool'; toolName: string; args: Record<string, unknown>; resultKey?: string }
  | { type: 'command'; command: string; resultKey?: string }
  | { type: 'update'; stateKey: string; value: unknown }
  | { type: 'stream'; command: string; stateKey: string }
  | { type: 'kill'; stateKey: string };
```

---

### Orchestration

Multi-agent orchestration for complex tasks.

```typescript
import { Director } from '@nero-ai/core/orchestration';

const director = new Director({
  maxSpecialists: 5,
  parallelExecution: true,
  autoApprove: false
});

// Start orchestrated session
const session = await director.orchestrate(
  'Build a REST API with authentication'
);

// Monitor progress
console.log(session.status); // 'planning' | 'executing' | 'completed' | 'failed'
console.log(session.tasks);

// Get results
const results = session.results;
```

#### Director Configuration

```typescript
interface DirectorConfig {
  maxSpecialists: number;      // Max concurrent specialists
  parallelExecution: boolean;  // Run tasks in parallel
  autoApprove: boolean;        // Auto-approve tool actions
}
```

#### Specialist Types

- `planner` - Breaks down goals into tasks
- `researcher` - Gathers information
- `architect` - Designs system structure
- `implementer` - Writes code
- `reviewer` - Reviews code quality
- `tester` - Creates and runs tests

---

### Skills

Load specialized capabilities dynamically.

```typescript
import { loadSkill, unloadSkill, listSkills } from '@nero-ai/core/skills';

// List available skills
const skills = await listSkills();

// Load a skill
await loadSkill('dialog');

// Skill is now available in context
// Use unloadSkill('dialog') to remove
```

---

### Agent

Direct agent interaction.

```typescript
import { Agent } from '@nero-ai/core/agent';

const agent = new Agent({
  model: 'anthropic/claude-3.5-sonnet',
  tools: ['read_file', 'write_file']
});

const response = await agent.chat('Hello, can you help me?');
```

---

### Memory

Store and retrieve memories.

```typescript
import { Memory } from '@nero-ai/core/db';

// Create memory
const memory = await Memory.create({
  body: 'User prefers TypeScript over JavaScript'
});

// Query memories
const memories = await Memory.search('TypeScript preferences');

// Delete
await Memory.delete(memory.id);
```

---

### Actions

Schedule future actions.

```typescript
import { Action } from '@nero-ai/core/db';

// Schedule one-time action
const action = await Action.schedule({
  timestamp: '2024-12-25T09:00:00Z',
  request: 'Send holiday greeting'
});

// Schedule recurring action
const recurring = await Action.schedule({
  timestamp: '2024-01-01T09:00:00Z',
  request: 'Daily briefing',
  recurrence: { unit: 'daily', hour: 9, minute: 0 }
});

// List and cancel
const actions = await Action.list();
await Action.cancel(action.id);
```

#### Recurrence Formats

```typescript
// Daily at 9:00 AM
{ unit: 'daily', hour: 9, minute: 0 }

// Weekly on Monday at 10:00 AM
{ unit: 'weekly', day: 1, hour: 10, minute: 0 }

// Monthly on 15th at 3:00 PM
{ unit: 'monthly', date: 15, hour: 15, minute: 0 }

// Every 30 minutes
{ unit: 'every_x_minutes', every_x_minutes: 30 }

// Every 2 hours
{ unit: 'every_x_hours', every_x_hours: 2 }
```

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key for OpenRouter (default provider) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `NERO_MODEL` | `anthropic/claude-3.5-sonnet` | Default LLM model |
| `NERO_BASE_URL` | `https://openrouter.ai/api/v1` | API base URL |
| `NERO_SERVICE_URL` | `http://localhost:4847` | Service URL |
| `NERO_SERVICE_PORT` | `4847` | Service port |
| `NERO_LICENSE_KEY` | - | License key for voice/SMS |
| `NERO_DANGEROUS` | `0` | Enable dangerous mode |
| `DATABASE_URL` | - | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `GROQ_API_KEY` | - | Groq API key |

---

## Error Handling

### CLI Errors

CLI commands exit with code 1 on error and print to stderr:

```
Error: Database not connected
```

### HTTP Errors

API returns standard HTTP status codes:

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad Request |
| 404 | Not Found |
| 500 | Server Error |

Error response format:

```json
{
  "error": "Description of what went wrong"
}
```

### Programmatic API Errors

Thrown errors include descriptive messages:

```typescript
try {
  await agent.chat('Hello');
} catch (error) {
  console.error(error.message);
}
```

---

## Rate Limits

- **OpenRouter**: Depends on your account tier
- **Local models**: No limits
- **Service API**: No rate limiting (local service)

---

## SDKs & Client Libraries

### Official

- **TypeScript**: `@nero-ai/core` (this package)

### Community

- Python SDK (community maintained)
- Rust client (community maintained)

See [integrations.md](./integrations.md) for more.

---

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for API changes between versions.
