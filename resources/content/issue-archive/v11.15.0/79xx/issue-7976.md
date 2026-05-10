---
id: 7976
title: Update MCP server config paths to use process.cwd()
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T14:50:43Z'
updatedAt: '2025-12-02T14:59:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7976'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T14:58:52Z'
---
# Update MCP server config paths to use process.cwd()

Updates the default configuration for the `knowledge-base` and `memory-core` MCP servers to resolve database and backup paths relative to `process.cwd()` instead of `__dirname`.

**Why:**
Previously, paths were resolved relative to `__dirname` (the location of the config file inside the package).
- In the Neo.mjs repo, this worked because the relative path `../../../../` pointed to the repo root.
- In scaffolded apps (where Neo.mjs is a dependency in `node_modules`), this relative path resolved to the `neo.mjs` package root inside `node_modules`, causing databases and backups to be stored inside `node_modules` instead of the application workspace.

**What:**
By using `process.cwd()`, we align with standard Node.js tooling behavior:
- **Dev Mode:** Running from the Neo.mjs repo root places artifacts in the repo root.
- **App Mode:** Running from a scaffolded app's root places artifacts in the app's root.

**Changes:**
- `ai/mcp/server/memory-core/config.mjs`: Update `memoryDb.path`, `memoryDb.backupPath`, and `sessionDb.backupPath`.
- `ai/mcp/server/knowledge-base/config.mjs`: Update `path` and `dataPath`.

## Timeline

- 2025-12-02T14:50:44Z @tobiu added the `enhancement` label
- 2025-12-02T14:50:44Z @tobiu added the `ai` label
- 2025-12-02T14:51:04Z @tobiu assigned to @tobiu
- 2025-12-02T14:58:52Z @tobiu closed this issue
### @tobiu - 2025-12-02T14:59:20Z

**Input from Gemini:**

> ✦ I have implemented the path resolution changes.
> 
> **Summary of Changes:**
> - Updated `ai/mcp/server/memory-core/config.mjs` and `ai/mcp/server/knowledge-base/config.mjs`.
> - Replaced `__dirname`-based relative paths with `process.cwd()`-based absolute paths.
> - This ensures that databases and backups are correctly located in the workspace root (e.g., `chroma-neo-memory-core`) regardless of whether the server is run from the repo root or as a dependency in a scaffolded app.
> - Applied code formatting improvements (block alignment) to align with project standards.
> 
> The commit has been pushed.


