---
id: 8346
title: Refactor DatabaseService to Config-based Opt-Out Auto-Sync
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T00:45:13Z'
updatedAt: '2026-01-06T01:10:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8346'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T01:10:29Z'
---
# Refactor DatabaseService to Config-based Opt-Out Auto-Sync

`DatabaseService` currently triggers an auto-sync/embed on startup. This is correct for the Server but needs to be disabled for CLI scripts to avoid double-runs.

**Goal:**
Use `KB_Config` to allow scripts to Opt-Out of Auto-Sync.

**Plan:**
1.  **`config.mjs`:** Add `autoSync: true` to the default configuration.
2.  **`DatabaseService.mjs`:** Modify `initAsync` to check `aiConfig.data.autoSync`. If false, skip the sync logic.
3.  **`ai/examples/sync_knowledge_base.mjs`:** Import `config.mjs` and set `aiConfig.data.autoSync = false` at the top level.

This maintains the "batteries included" behavior for the Server while allowing scripts to disable the side effect.

## Timeline

- 2026-01-06T00:45:14Z @tobiu added the `enhancement` label
- 2026-01-06T00:45:15Z @tobiu added the `ai` label
- 2026-01-06T00:47:07Z @tobiu assigned to @tobiu
- 2026-01-06T00:52:46Z @tobiu changed title from **Suppress DatabaseService Auto-Sync for External Scripts** to **Refactor DatabaseService to Opt-In Auto-Sync**
- 2026-01-06T00:56:12Z @tobiu changed title from **Refactor DatabaseService to Opt-In Auto-Sync** to **Refactor DatabaseService to Config-based Opt-In Auto-Sync**
- 2026-01-06T00:58:44Z @tobiu changed title from **Refactor DatabaseService to Config-based Opt-In Auto-Sync** to **Refactor DatabaseService to Config-based Opt-Out Auto-Sync**
### @tobiu - 2026-01-06T01:09:16Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully refactored `DatabaseService` to use a Config-based "Opt-Out" strategy for Auto-Sync.
> 
> **Changes Implemented:**
> 
> 1.  **`ai/mcp/server/knowledge-base/config.mjs`:**
>     *   Added `autoSync: true` to the `defaultConfig`.
>     *   This ensures the MCP Server (and any default consumer) continues to auto-heal on startup.
> 
> 2.  **`ai/mcp/server/knowledge-base/services/DatabaseService.mjs`:**
>     *   Updated `initAsync` to check `aiConfig.data.autoSync`.
>     *   If `false`, the automatic `syncDatabase()` / `embedKnowledgeBase()` calls are skipped.
> 
> 3.  **`ai/services.mjs` (SDK Entry Point):**
>     *   Added `KB_Config.data.autoSync = false` at the top level.
>     *   This ensures that any script importing the AI SDK (e.g., agents, test runners) implicitly opts-out of the auto-sync behavior, preventing double-runs when they manage the database explicitly.
> 
> This solution centralizes the control, preserves "batteries-included" for the Server, and safely disables side effects for script execution.

- 2026-01-06T01:10:29Z @tobiu closed this issue
- 2026-01-06T10:24:12Z @tobiu referenced in commit `19bd72d` - "Enhancement: Refactor DatabaseService to Config-based Opt-Out Auto-Sync #8346

Added 'autoSync: true' to default KB configuration. Modified DatabaseService to check this flag before auto-syncing on startup. Updated 'ai/services.mjs' (SDK entry point) to explicitely set 'autoSync = false', ensuring that scripts consuming the SDK do not trigger redundant sync operations."
- 2026-01-06T10:34:06Z @tobiu cross-referenced by #8347

