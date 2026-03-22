# CLAUDE.md

This file provides guidance for AI assistants (like Claude Code) working in this repository.

## Repository Overview

**Repository**: terrysc107-cloud/Claude-code
**Current State**: New/empty repository — no source files have been committed yet.

This document will be updated as the project evolves. The conventions below apply from project inception.

---

## Git Workflow

### Branch Naming
- Feature branches: `claude/<description>-<session-id>` (used by Claude Code agents)
- Human feature branches: `feature/<description>`
- Bug fixes: `fix/<description>`
- Documentation: `docs/<description>`

### Commit Conventions
- Use clear, descriptive commit messages in the imperative mood: `Add X`, `Fix Y`, `Update Z`
- Keep commits focused and atomic — one logical change per commit
- Include a session URL at the end of AI-generated commits:
  ```
  <summary line>

  https://claude.ai/code/session_<id>
  ```

### Push Rules
- Always push with `-u` to set tracking: `git push -u origin <branch-name>`
- Branch names for Claude Code agents **must** start with `claude/`
- Never force-push to `main`/`master` without explicit user confirmation
- Never skip hooks (`--no-verify`) without explicit user request

---

## Development Workflow

### Before Making Changes
1. Read relevant files before editing — never modify code you haven't read
2. Understand the existing patterns before introducing new ones
3. For multi-step tasks, use `TodoWrite` to track progress

### Making Changes
- Prefer editing existing files over creating new ones
- Keep changes minimal and focused on the task at hand
- Do not add docstrings, comments, or refactors to unchanged code
- Avoid over-engineering: no premature abstractions, no hypothetical future requirements

### After Making Changes
- Verify the change works as intended
- Commit with a clear message
- Push to the feature branch

---

## Code Conventions (To Be Defined)

> These sections will be populated once source code is added to the repository.

### Languages & Frameworks
- TBD — update this section when the tech stack is established

### Directory Structure
- TBD — document the project layout here once it exists

### Naming Conventions
- TBD — file naming, variable naming, function naming patterns

### Testing
- TBD — test framework, how to run tests, test file conventions

### Linting & Formatting
- TBD — linters, formatters, and how to run them

### Build & Run
- TBD — commands to build, run, and develop the project

---

## Working with Claude Code

### Key Behaviors
- Claude Code reads files before editing; it will not guess at file contents
- Risky/destructive actions (delete files, force push, drop tables) require explicit user confirmation
- Claude Code uses parallel tool calls where tasks are independent
- Claude Code tracks multi-step work via a todo list visible to the user

### Permissions & Safety
- Claude Code will not run `rm -rf`, `git reset --hard`, or other destructive commands without confirmation
- Claude Code will not skip pre-commit hooks
- Claude Code will not push to branches other than the designated feature branch

### Hooks (if configured)
- Document any `settings.json` hooks here so AI assistants know what runs automatically
- Example: pre-commit hook runs `npm test` → ensure tests pass before committing

---

## Security Guidelines

- Do not commit secrets, API keys, or credentials
- Do not add `.env` files to version control
- Use environment variables for sensitive configuration
- Validate all external input at system boundaries

---

## Updating This Document

This CLAUDE.md should be updated:
- When the tech stack is chosen
- When build/test/lint commands are established
- When directory structure is finalized
- When new conventions are adopted by the team

Keep this document accurate — AI assistants rely on it to work effectively in this codebase.
