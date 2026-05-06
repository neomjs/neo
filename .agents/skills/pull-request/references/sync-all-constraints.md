# Tool Constraint: sync_all

## Branch Constraint

You MUST NOT execute the `sync_all` tool while checked out on a feature branch (e.g., `agent/1234-feature`).

**Why:** The `sync_all` tool triggers a bi-directional synchronization of GitHub issues and releases with the local filesystem. Running it on a feature branch will pollute that branch with unrelated documentation commits, creating massive diff bloat and merge conflicts.

## Execution Protocol

Before invoking `sync_all`:
1. Stash or commit any active work on your current feature branch.
2. Checkout the default branch (`dev`): `git checkout dev`.
3. Invoke the `sync_all` MCP tool.
4. Return to your feature branch: `git checkout -`.
