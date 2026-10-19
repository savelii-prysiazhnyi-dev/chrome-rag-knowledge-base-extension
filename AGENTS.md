# Agent Instructions & Repository Workflow

## Mandatory Change & Commit Workflow

Whenever an AI agent makes changes to the repository (code, documentation, configuration, or schemas), it **MUST**:

1. **Maintain [`CHANGELOG.md`](./CHANGELOG.md):**
   - Document all notable additions, changes, fixes, and architectural decisions under the `[Unreleased]` (or appropriate version) section following the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

2. **Commit Changes Automatically Using the `commit` Skill ([`.agents/skills/commit/SKILL.md`](./.agents/skills/commit/SKILL.md)):**
   - Follow the commit conventions in `.agents/skills/commit/SKILL.md` (`<type>(<scope>): <short description>`, lowercase, imperative mood, no trailing period, never add AI co-author credit, and stage explicit file paths via `git add <file1> <file2> ...` rather than `git add .` or `git add -A`).
   - **No Confirmation Needed:** Execute all phases (crafting the commit message, selecting relevant files, staging, and committing) automatically at the end of each change without pausing to ask for user confirmation.
