---
name: worktree-bootstrap
description: Find the Brain-owned worktree hydration contract.
---

# Worktree hydration

Worktree configuration and data hydration belongs to
[Brain's bootstrap implementation](https://github.com/neomjs/neo-agent-brain/blob/dev/ai/scripts/migrations/bootstrapWorktree.mjs).
Read its current contract in the Brain checkout before using it; this retained
concept is a pointer, not an Engine-local execution recipe.

Fleet-managed seats use
[managed Start preparation](https://github.com/neomjs/neo-agent-brain/blob/dev/ai/services/fleet/startAgentProvisioned.mjs).
Their harness configuration and memory loading belong to that preparation path.
