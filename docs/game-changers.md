# Game Changer Features

Nero OSS includes several features that fundamentally change how AI assistants can work. These aren't incremental improvements—they're qualitative shifts in capability.

## 1. Multi-Agent Orchestration

**What it is:** A director system that coordinates multiple specialist subagents to tackle complex tasks that would overwhelm a single agent.

**How it works:**
```bash
nero orchestrate start "Build a CLI tool for managing Docker containers"
```

The director spawns specialists:
- **Planner** breaks down the goal into milestones
- **Researcher** investigates APIs and best practices
- **Architect** designs the system structure
- **Implementer** writes the actual code
- **Reviewer** checks for issues
- **Tester** validates the solution

Each specialist is a real subagent with full tool access. They communicate through a message bus and can work in parallel or sequence depending on dependencies.

**Why it matters:** Complex projects no longer need to fit in a single context window. The director manages state, handles handoffs between specialists, and synthesizes their outputs into coherent results.

**CLI commands:**
```bash
nero orchestrate start <goal>     # Start a new orchestration
nero orchestrate list             # Show active orchestrations
nero orchestrate show <id>        # View details and messages
nero orchestrate demo             # Run a demo orchestration
```

---

## 2. Predictive Action Engine

**What it is:** Learns from user behavior patterns to anticipate what you'll ask for next, then proactively suggests or executes actions.

**How it works:**
- Every tool execution is logged with context (time, recent activity, user history)
- Pattern recognition identifies sequences like "check calendar → list GitHub PRs → review specific PR"
- When a familiar sequence starts, Nero predicts the likely next steps
- Suggestions appear as ambient cards or inline prompts

**Example:** If you always check your deployment status after pushing code, Nero learns this and starts showing deployment status proactively when it detects a push.

**Configuration:**
```json
{
  "proactivity": {
    "enabled": true,
    "confidenceThreshold": 0.7,
    "maxSuggestionsPerSession": 5
  }
}
```

**Why it matters:** Eliminates repetitive request patterns. The assistant becomes genuinely proactive rather than purely reactive.

---

## 3. Long-Term Goal Management

**What it is:** A full project management system for work that spans multiple sessions, with milestones, dependencies, and task tracking.

**How it works:**
```bash
/goals create "Build mobile app" "React Native app for iOS/Android" priority:5
```

Goals have:
- **Milestones** with ordered completion stages
- **Dependencies** between milestones (can't start B until A is done)
- **Tasks** within milestones with priority and autonomy eligibility
- **Progress tracking** across sessions
- **Blocker detection** for stuck work

**Autonomy integration:** Tasks marked `autonomyEligible: true` can be picked up by Nero during autonomous sessions. When you give Nero free time, it actually advances your projects.

**CLI commands:**
```bash
/goals list                 # Show active goals
/goals show <id>            # Detailed progress report
/goals advance <id>         # Complete current milestone
/goals tasks                # Tasks Nero can work on
/goals attention            # Goals with issues (overdue, blocked)
```

**Why it matters:** AI assistants are usually amnesiac. This gives Nero persistent state across sessions with structured project tracking—not just a chat history.

---

## 4. Tool Output Learning

**What it is:** Captures and indexes every tool execution so Nero can learn from past outputs and answer questions without re-running commands.

**How it works:**
- Every tool call is stored: command, args, output, exit code, timestamp
- Semantic search over tool outputs
- When you ask "what did that error say last Tuesday?" Nero finds the actual output
- Pattern detection: "this command always fails when X condition is true"

**CLI commands:**
```bash
/learn search "docker build error"    # Search past tool outputs
/learn stats                          # Tool usage analytics
/learn patterns                       # Detected failure patterns
```

**Why it matters:** Most assistants treat tool calls as ephemeral. This builds institutional memory of your environment, errors, and solutions—making Nero more useful the longer you use it.

---

## Architecture

These features share infrastructure:

```
┌─────────────────────────────────────────────┐
│           Nero Core                         │
├─────────────────────────────────────────────┤
│  Multi-Agent      Predictive     Tool       │
│  Orchestration ←→ Action ←────→ Learning   │
│       ↓            Engine          ↑        │
│       └────────→ Goal Mgmt ────────┘        │
│                    ↓                        │
│              SQLite/Postgres                │
└─────────────────────────────────────────────┘
```

All four systems integrate with:
- **Dispatch system** for subagent spawning
- **Database layer** for persistence
- **Autonomy framework** for self-directed work
- **CLI** for user interaction

---

## Using the Features Together

Here's how they compose:

1. **You create a goal:** `/goals create "Refactor auth system"`
2. **Orchestration breaks it down** into milestones and tasks
3. **Predictive engine** learns your refactoring patterns
4. **Tool learning** captures errors and solutions as you work
5. **Autonomous sessions** pick up eligible tasks and advance the goal

The result: an assistant that manages complex work over time, learns your patterns, and gets more helpful with use.

---

## Configuration

All features are opt-in via config:

```json
{
  "orchestration": {
    "enabled": true,
    "maxParallelSpecialists": 3
  },
  "proactivity": {
    "enabled": true,
    "confidenceThreshold": 0.7
  },
  "goalManagement": {
    "enabled": true,
    "defaultGoalPriority": 3
  },
  "toolLearning": {
    "enabled": true,
    "maxHistoryDays": 30
  }
}
```

Set `enabled: false` to disable any feature you don't want.
