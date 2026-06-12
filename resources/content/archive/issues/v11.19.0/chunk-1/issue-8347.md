---
id: 8347
title: Refactor Memory & GitHub Services to Config-based Opt-Out Auto-Sync
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-06T10:34:04Z'
updatedAt: '2026-01-06T10:37:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8347'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-06T10:37:12Z'
---
# Refactor Memory & GitHub Services to Config-based Opt-Out Auto-Sync

Apply the config-based "Opt-Out" pattern (from #8346) to `Memory Core` and `GitHub Workflow` services. This ensures that scripts using the AI SDK (`ai/services.mjs`) do not trigger unintended side effects (auto-summarization or full GitHub syncs) on startup.

**Plan:**

1.  **Memory Core:**
    *   Update `ai/mcp/server/memory-core/config.mjs`: Add `autoSummarize: true`.
    *   Update `ai/mcp/server/memory-core/services/SessionService.mjs`: Check `aiConfig.data.autoSummarize` in `initAsync`.
    *   Update `ai/services.mjs`: Set `Memory_Config.data.autoSummarize = false`.

2.  **GitHub Workflow:**
    *   Update `ai/services.mjs`: Set `GH_Config.data.syncOnStartup = false`. (Note: `syncOnStartup` already exists in `GH_Config`).

This unifies the behavior across all three AI infrastructure services (KB, Memory, GH).

## Timeline

- 2026-01-06T10:34:06Z @tobiu added the `enhancement` label
- 2026-01-06T10:34:06Z @tobiu added the `ai` label
- 2026-01-06T10:36:23Z @tobiu assigned to @tobiu
- 2026-01-06T10:36:40Z @tobiu referenced in commit `41a9ad3` - "Refactor Memory & GitHub Services to Config-based Opt-Out Auto-Sync #8347"
### @tobiu - 2026-01-06T10:36:55Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the config-based "Opt-Out" pattern for Memory Core and GitHub Workflow services.
> 
> **Changes Implemented:**
> 
> 1.  **Memory Core:**
>     *   **Config:** Added `autoSummarize: true` to `ai/mcp/server/memory-core/config.mjs`.
>     *   **Service:** Updated `ai/mcp/server/memory-core/services/SessionService.mjs` to check `aiConfig.data.autoSummarize` before running startup summarization.
>     *   **SDK:** Updated `ai/services.mjs` to set `Memory_Config.data.autoSummarize = false`.
> 
> 2.  **GitHub Workflow:**
>     *   **SDK:** Updated `ai/services.mjs` to set `GH_Config.data.syncOnStartup = false` (leveraging the existing config property).
> 
> **Verification:**
> Ran `node ai/examples/debug_session_state.mjs` (which uses the SDK). Confirmed that the `[Startup] Checking for unsummarized sessions...` log message was absent, proving the auto-summarization was successfully disabled. The script was still able to manually trigger summarization using the service methods, confirming that the functionality remains available when explicitly invoked.
> 
> This ensures a consistent behavior across all AI infrastructure services: "Batteries Included" for MCP Servers (auto-sync/summarize), but "Opt-In" for SDK scripts (no side effects).

- 2026-01-06T10:37:12Z @tobiu closed this issue

