---
name: qa-verify
description: >-
  Execute project quality verification checks (linting, formatting, typechecking,
  unit tests, and build validation) and produce a structured QA report. Use this
  skill whenever acting as the QA Tester subagent or verifying code changes.
---

# QA Verification Skill (`qa-verify`)

Follow these steps to verify all uncommitted changes in the workspace.

## Step 1 — Run the Automated Verification Script

Execute the workspace verification script from the repository root:

```bash
bash .agents/skills/qa-verify/scripts/verify.sh
```

This script dynamically inspects `package.json` and runs every configured quality gate in order:

1. **Linter** (`pnpm run lint`)
2. **Formatter Check** (`pnpm run format:check`)
3. **TypeScript Compiler Check** (`pnpm run typecheck` or `pnpm exec tsc --noEmit` if `tsconfig.json` is present)
4. **Test Suite** (`pnpm run test`, when configured)
5. **Extension Build Check** (`pnpm run build`, when configured)

## Step 2 — Targeted Inspection & Test Coverage Check

1. Run `git status -s` to inspect all modified and newly created files.
2. Verify that:
   - [`CHANGELOG.md`](../../../CHANGELOG.md) has been updated under `[Unreleased]` for notable changes.
   - Relevant subsystem documentation in [`docs/`](../../../docs/) has been added or updated if a major architectural component was introduced.
   - New core logic (e.g., chunking, database transactions, vector math, URL canonicalization) includes corresponding unit tests once the test runner is initialized.

## Step 3 — Return a Structured QA Report

Report back to the Orchestrator using this exact structure:

```markdown
### QA Verification Report

- **Status:** PASS | FAIL
- **Lint (`pnpm run lint`):** PASS | FAIL (details if failed)
- **Format (`pnpm run format:check`):** PASS | FAIL (details if failed)
- **Typecheck:** PASS | FAIL | N/A (details if failed)
- **Tests:** PASS | FAIL | N/A (details if failed)
- **Changelog & Docs Check:** PASS | FAIL (details if missing)
- **Actionable Errors (if FAIL):**
  - <file path:line> — <exact error message and how to reproduce>
```
