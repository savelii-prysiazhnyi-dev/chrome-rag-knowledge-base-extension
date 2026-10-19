# 3-Agent Development Pipeline Rule (`workflow.md`)

Whenever the user approves a plan or asks to implement a feature, refactor, or code task (whether specified via referenced files or directly in the prompt), follow this **3-Agent Development Pipeline**:

---

## 0. Subagent Role Registration (Once Per Conversation)

Before delegating for the first time in a session, the Parent Agent **MUST** call `define_subagent` to register two isolated subagent types (with `enable_subagent_tools: false` so subagents never recursively spawn subagents):

1. **`implementer`** (`enable_write_tools: true`, `enable_subagent_tools: false`):
   - **Description:** Lead Implementer subagent that writes and updates application code, tests, `docs/` subsystem documentation, and `CHANGELOG.md` entries.
   - **System Prompt:** Instructs the agent to implement the scoped task cleanly according to the provided task specification and `AGENTS.md`, update `CHANGELOG.md` (and `docs/` when introducing architectural components), run `pnpm run format`, and **leave all changes uncommitted** so the QA Tester and Lead Architect can verify and review the `git diff`.
2. **`qa-tester`** (`enable_write_tools: true`, `enable_subagent_tools: false`):
   - **Description:** QA Tester subagent that runs the `qa-verify` skill to validate linting, formatting, typechecking, tests, and builds.
   - **System Prompt:** Instructs the agent to read and execute `.agents/skills/qa-verify/SKILL.md` (`bash .agents/skills/qa-verify/scripts/verify.sh`), inspect changed files, and return the structured QA Verification Report without modifying application code.

> **Role Boundary Guard:** If you are currently running _as_ the `implementer` or `qa-tester` subagent, execute your assigned task directly and **never** attempt to delegate to subagents.

---

## 1. Role of Parent Agent (Gemini 4 Argon — Architect & Orchestrator)

- You are the **Lead Architect, Orchestrator, and Final Reviewer**.
- You handle architectural planning, design interviews (`/grill-me`, `/plan`), and Q&A directly.
- For code/feature implementation tasks, **do NOT write or edit implementation code directly**; orchestrate the `implementer` and `qa-tester` subagents below, conduct the final `git diff` review, and commit the approved result.

---

## 2. Step 1: Implementation Delegation (`implementer` — Pro / Flash Fallback)

- Call `invoke_subagent` with:
  - `TypeName`: `"implementer"`
  - `Role`: `"Lead Implementer"`
  - `Model`: `"pro"` (routes to Claude Sonnet 5.5 by default)
  - `Prompt`: Provide the user's task requirements, any referenced task/specification files, and architectural constraints. Instruct the implementer to update `CHANGELOG.md` (and `docs/` if applicable), run `pnpm run format`, and leave changes uncommitted.
- **Quota Fallback & User Override:**
  - If the user explicitly requests Flash (e.g., _"use flash"_ or _"claude quota low"_), or if the `Model="pro"` invocation fails/errors due to usage quota or rate limits, automatically invoke `implementer` with `Model="flash"` (Gemini 3.8 Flash).

---

## 3. Step 2: Verification Delegation (`qa-tester` — Gemini 3.8 Flash)

- Once `implementer` completes, call `invoke_subagent` with:
  - `TypeName`: `"qa-tester"`
  - `Role`: `"QA Tester"`
  - `Model`: `"flash"`
  - `Prompt`: `"Read and execute the qa-verify skill (.agents/skills/qa-verify/SKILL.md) to verify all current workspace changes and return the structured QA Verification Report."`
- **Automated Feedback Loop:**
  - If `qa-tester` reports **FAIL** on any check, send the exact failure report to the existing `implementer` subagent using `send_message` to fix the issues.
  - Once `implementer` replies that the fixes are complete, message `qa-tester` via `send_message` to re-run the `qa-verify` skill. Repeat until all checks pass with **0 errors**.

---

## 4. Step 3: Final Architectural Review, Commit & Deep-Learning Breakdown (Gemini 4 Argon)

1. **Architectural Audit:**
   - Once `qa-tester` reports **PASS**, run `git status` and `git diff` yourself.
   - Audit the diff against the user's task specification, [`docs/SPECIFICATION.md`](../../docs/SPECIFICATION.md), security best practices, and edge cases.
   - If you detect any architectural or logic flaws, send feedback to `implementer` via `send_message` and re-run Step 2 (`qa-tester`) before approving.
2. **Automatic Commit (`commit` Skill):**
   - Once approved, stage the explicit files (`git add <file1> <file2> ...`) and commit automatically following [`.agents/skills/commit/SKILL.md`](../skills/commit/SKILL.md) without asking for confirmation.
3. **Final Report & Pedagogical Explanation:**
   - Present a structured summary to the user:
     - **Implementation (`Lead Implementer`):** Summary of files created/updated.
     - **Verification (`QA Tester`):** Summary of `qa-verify` checks passed.
     - **Architectural Review (`Lead Architect`):** Review verdict and commit hash.
     - **Deep Engineering & Theory Breakdown:** Explain _how_ and _why_ the implementation works under the hood, relevant browser/ML/database internals, and architectural trade-offs (per `AGENTS.md`).
