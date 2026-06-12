---
name: worktree-bootstrap
description: Automatic initialization sequence for fresh Git worktree sessions for Antigravity (Gemini).
---

# Worktree Bootstrap Protocol

When operating in a fresh Git worktree (e.g., a newly checked out branch in a separate folder), the environment starts off without essential gitignored configurations and the shared `.neo-ai-data` substrate. These are required for correct agent behavior, knowledge base access, and swarm state synchronization.

**Trigger:**
Whenever you start a fresh session in a new worktree, you MUST execute this bootstrap process before performing any tasks that rely on the Memory Core, Knowledge Base, or SDK services.

**Action:**
Execute the following script to unify the local infrastructure with the canonical checkout:

```bash
node ai/scripts/bootstrapWorktree.mjs --link-data
```

**What this does:**
1. Copies existing gitignored `config.mjs` local overrides from the canonical checkout to ensure local environment settings and authentication values are preserved.
2. Symlinks the `.neo-ai-data/` directory (containing SQLite, Chroma DB, wake-daemon, etc.) to the canonical path, preserving swarm-wide context and preventing data fragmentation.
3. Links gitignored handoff files (like `sandman_handoff.md`) from the canonical checkout.

**Shell Authentication Verification:**
Due to shell sandbox isolation in the Antigravity harness, the GitHub CLI may lack credentials. After bootstrap, verify your shell authentication before pushing branches:
```bash
env | cut -d= -f1 | rg '^GH_TOKEN$'
gh api user --jq .login
```
*Expected output:* The environment MUST contain `GH_TOKEN` (verified by name, do not print its value) and `gh api user` MUST return your agent identity (e.g., `neo-gemini-3-1-pro`). If auth fails, ensure the operator has updated `.zshenv` to source the correct `.env` file for your worktree path.

**Task-Specific Modifiers:**
- **Docs-only tickets:** `--link-data` is sufficient.
- **Backend / MCP / Unit-test tickets:** Append `--install` (e.g., `node ai/scripts/bootstrapWorktree.mjs --link-data --install`) to also install dependencies and `bundle-parse5`.
- **Frontend / Webpack tickets:** Append `--build-all` to imply install and execute the full Webpack distribution build.
