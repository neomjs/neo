---
name: worktree-bootstrap
description: Current config and shared-data hydration contract for fresh Antigravity worktrees or sibling clones.
---

# Worktree Bootstrap Protocol

When operating in a fresh Git worktree (e.g., a newly checked out branch in a separate folder), the environment starts off without essential gitignored configurations and the shared `.neo-ai-data` substrate. These are required for correct agent behavior, knowledge base access, and swarm state synchronization.

**Trigger:**
Whenever you start a fresh session in a new worktree, you MUST execute this bootstrap process before performing any tasks that rely on the Memory Core, Knowledge Base, or SDK services.

**Action:**
Run the current migration entry point. A true git worktree can discover its canonical checkout; an independent Antigravity clone must name it explicitly:

```bash
node ai/scripts/migrations/bootstrapWorktree.mjs --link-data
node ai/scripts/migrations/bootstrapWorktree.mjs --link-data --canonical-root <canonical-checkout>
```

**What this does:**
1. Copies existing gitignored `config.mjs` local overrides from the canonical checkout to ensure local environment settings and authentication values are preserved.
2. Creates approved granular links for shared SQLite, Chroma, concept, backup, and read-alias data under `.neo-ai-data/`. The parent directory is never replaced, and process-control directories remain clone-local.
3. Links approved gitignored single-file handoffs (currently `resources/content/sandman_handoff.md`) from the canonical checkout without symlinking their parent directories.
4. Runs the full bootstrap build. The CLI always reaches `build-all`; `--install` and `--build-all` are not supported flags. Composers that already own install/build orchestration import `hydrateCurrentWorktree({mainCheckout, projectRoot})` for hydration without invoking the CLI.

**Shell Authentication Verification:**
Due to shell sandbox isolation in the Antigravity harness, the GitHub CLI may lack credentials. After bootstrap, verify your shell authentication before pushing branches:
```bash
env | cut -d= -f1 | rg '^GH_TOKEN$'
gh api user --jq .login
```
*Expected output:* The environment MUST contain `GH_TOKEN` (verified by name, do not print its value) and `gh api user` MUST return your agent identity (e.g., `neo-gemini-3-1-pro`). If auth fails, ensure the operator has updated `.zshenv` to source the correct `.env` file for your worktree path.

**Supported setup modifiers:**
- `--canonical-root <path>` (or `NEO_AI_CANONICAL_ROOT`) for an independent sibling clone.
- `--force` to replace conflicting approved data-link destinations deliberately.
- `--link-data` to opt into the granular shared-data and handoff links.

The same script also has explicit prune-only flags (`--prune-stale`, `--dry-run`, `--include-dirty`, `--schedule-local`, `--interval-ms`); those are destructive worktree lifecycle operations, not bootstrap modifiers.
