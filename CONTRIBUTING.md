# Contributing to Nero

Thanks for your interest in contributing to Nero! This document outlines the process for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Set up the development environment:

```bash
bun install
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY

# Optional: Start PostgreSQL
docker compose up db -d
bun run db:migrate

# Start development
bun run dev:service  # Terminal 1
bun run dev          # Terminal 2
```

## Development Workflow

1. Create a branch for your changes:
   ```bash
   git checkout -b feat/your-feature
   ```

2. Make your changes following our code style (enforced by ESLint/Prettier)

3. Run tests and linting:
   ```bash
   bun run lint
   bun run test
   ```

4. Commit using conventional commits:
   ```bash
   git commit -m "feat: add new feature"
   git commit -m "fix: resolve issue with X"
   ```

5. Push and open a Pull Request

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `refactor:` - Code changes that neither fix bugs nor add features
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

## Pull Request Process

1. Ensure your PR description clearly describes the problem and solution
2. Link any relevant issues
3. Make sure all CI checks pass
4. Request review from maintainers
5. Address any feedback

## Code Style

- TypeScript for all source code
- No comments above code (code should be self-documenting)
- Use ES modules (import/export)
- Prefer async/await over callbacks
- Follow existing patterns in the codebase

## Reporting Bugs

Open an issue with:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)

## Feature Requests

Open an issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Questions?

Open a Discussion or reach out at hello@pompeiilabs.com
