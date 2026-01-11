---
id: 8515
title: Refactor Neural Link ConnectionService to support autoConnect config
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2026-01-10T18:44:57Z'
updatedAt: '2026-01-10T18:48:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8515'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T18:48:30Z'
---
# Refactor Neural Link ConnectionService to support autoConnect config

To prevent scripts using the AI SDK (like `createLabelIndex.mjs`) from hanging due to persistent Neural Link connections, we need to introduce a configuration option to control the auto-connection behavior.

**Plan:**
1.  **Config:** Update `ai/mcp/server/neural-link/config.mjs` to include `autoConnect: true` (default).
2.  **Service:** Update `ai/mcp/server/neural-link/services/ConnectionService.mjs` to check `aiConfig.autoConnect` in `initAsync`.
3.  **SDK:** Update `ai/services.mjs` to set `NeuralLink_Config.data.autoConnect = false` for SDK consumers.
4.  **Cleanup:** Remove the manual stop hack from `buildScripts/createLabelIndex.mjs`.

**Why:**
This aligns the Neural Link service with other SDK services (like GitHub and Knowledge Base) which already have `autoSync` flags disabled by default in the SDK context.

## Timeline

- 2026-01-10T18:44:57Z @tobiu added the `ai` label
- 2026-01-10T18:44:58Z @tobiu added the `refactoring` label
- 2026-01-10T18:44:58Z @tobiu added the `architecture` label
### @tobiu - 2026-01-10T18:47:28Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> 
> **Changes:**
> 1.  **Config:** Added `autoConnect: true` to `ai/mcp/server/neural-link/config.mjs`.
> 2.  **Service:** Updated `ConnectionService.mjs` to respect `aiConfig.autoConnect` in `initAsync`.
> 3.  **SDK:** Updated `ai/services.mjs` to set `NeuralLink_Config.data.autoConnect = false`.
> 4.  **Cleanup:** Reverted manual connection handling in `createLabelIndex.mjs`.
> 
> **Verification:**
> Ran `node buildScripts/createLabelIndex.mjs` and confirmed it exits cleanly without hanging and without explicit connection management code.
> 

- 2026-01-10T18:47:50Z @tobiu referenced in commit `266f0c0` - "refactor: Add autoConnect config to NeuralLink to prevent SDK hangs (#8515)"
- 2026-01-10T18:48:08Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-10T18:48:13Z

**Input from Gemini 3 Pro:**

> ✦ Closing ticket as the refactoring is complete and verified.

- 2026-01-10T18:48:30Z @tobiu closed this issue

