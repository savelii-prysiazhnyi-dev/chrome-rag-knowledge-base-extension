---
name: commit
allowed-tools: Bash(git:*), Read, Glob, Grep
description: Craft a commit message, select files, then commit
argument-hint: [topic or description of changes]
---

# Commit

Follow these three phases in order. Do NOT skip ahead or combine phases.

## Commit Message Format

This project uses Conventional Commits with optional scope:

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`

Examples from this repo:

- `test(auth): add integration tests for all auth routes`
- `fix: reset retried flag after token refresh so future 401s can auto-renew`
- `refactor(gemini): move SYSTEM_INSTRUCTION to module-level`
- `chore: add .prettierignore; add prettier, frontend eslint scripts`

Rules:

- Lowercase type and description
- No period at the end
- Scope is optional but preferred when the change is scoped to a subsystem
- Description is imperative mood ("add", "fix", "move" — not "added", "fixes")
- **Never** add Claude co-author credit to the commit message

---

## Phase 1 — Craft the Commit Message

1. Run `git diff HEAD` and `git status` to see all unstaged and staged changes.
2. Also run `git log --oneline -5` to reconfirm the project's style.
3. Based on the diff and the user's topic/description (if provided), draft a commit message following the format above.
4. **Display the proposed commit message to the user** and ask for approval before proceeding. Do not move to Phase 2 until the user confirms or adjusts the message.

---

## Phase 2 — Select Files to Stage

1. Based on the commit message and topic, identify which changed files are relevant to this commit.
2. Run `git status` to see all modified/untracked files.
3. **Display the list of files you plan to stage** to the user and confirm before proceeding. Do not move to Phase 3 until the user approves the file selection.

---

## Phase 3 — Commit

1. Stage only the confirmed files using `git add <file1> <file2> ...` (never `git add -A` or `git add .`).
2. Commit with the confirmed message using a heredoc:
   ```
   git commit -m "$(cat <<'EOF'
   <confirmed commit message>
   EOF
   )"
   ```

---

Arguments: $ARGUMENTS
