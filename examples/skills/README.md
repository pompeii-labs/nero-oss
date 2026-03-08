# Example Skills for Nero

This directory contains example skills demonstrating the Nero Skills system. Skills are reusable prompts that specialize Nero for specific tasks.

## What Are Skills?

Skills extend Nero's capabilities with specialized instructions for common tasks. When you activate a skill, those instructions are loaded into Nero's context, making him an expert in that domain.

## How to Use These Examples

1. **Copy to your skills directory:**
   ```bash
   cp -r examples/skills/code-review ~/.nero/skills/
   ```

2. **Use the skill:**
   ```
   > Can you review this code for me? [paste code]
   
   # Or explicitly load it
   > Use the code-review skill
   ```

3. **Customize:** Edit the SKILL.md files to match your team's standards and preferences.

## Available Skills

### Development

| Skill | Description |
|-------|-------------|
| **code-review** | Comprehensive code review covering bugs, security, performance, and maintainability |
| **debug-assistant** | Systematic debugging methodology for isolating and fixing bugs |
| **write-tests** | Generate unit, integration, and e2e tests with proper coverage |
| **refactor-code** | Improve code quality while preserving behavior |
| **explain-code** | Break down complex code for any technical level |

### Architecture & Design

| Skill | Description |
|-------|-------------|
| **api-design** | Review and improve REST, GraphQL, or gRPC API designs |
| **database-schema** | Review schemas for normalization, performance, and scalability |
| **security-audit** | Security-focused code review against OWASP Top 10 |

### Team Practices

| Skill | Description |
|-------|-------------|
| **pr-description** | Write clear, comprehensive PR descriptions |

## Creating Your Own Skills

Create a new skill with:

```bash
nero skills create my-skill
```

Or manually:

1. Create a directory: `~/.nero/skills/my-skill/`
2. Add a `SKILL.md` file with:
   - **Title**: Skill name
   - **Description**: What it does
   - **When to Use**: Trigger conditions
   - **Instructions**: Detailed guidance for Nero
   - **Arguments**: Use `$ARGUMENTS` to receive parameters

## Skill Format

```markdown
# Skill Name

## Description
Brief description of what this skill does.

## When to Use
- When to activate this skill
- Trigger conditions

## Instructions
Detailed instructions for how Nero should behave when this skill is active.

Arguments: $ARGUMENTS
```

## Best Practices

1. **Be specific** - The more detailed your instructions, the better Nero performs
2. **Include examples** - Show input/output examples when helpful
3. **Define output format** - Specify how Nero should structure responses
4. **Keep it focused** - One skill per task, not one skill for everything
5. **Version control** - Store team skills in a shared repo

## Sharing Skills

Skills follow the [Agent Skills](https://skills.sh) standard. Share them via:

```bash
# Install from a GitHub repo
nero skills add username/repo

# Or share the skill directory directly
```
