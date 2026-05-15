---
id: 7930
title: 'Bug: GitHub HealthService fails in standalone SDK scripts'
state: CLOSED
labels:
  - invalid
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T16:23:27Z'
updatedAt: '2025-11-29T16:42:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7930'
author: tobiu
commentsCount: 1
parentIssue: 7914
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T16:42:01Z'
---
# Bug: GitHub HealthService fails in standalone SDK scripts

# Bug: GitHub HealthService fails in standalone SDK scripts

## Context
When running standalone agent scripts (e.g., `ai/agents/pm.mjs`) directly via `node`, `GH_HealthService.healthcheck()` consistently reports authentication failure (`GitHub Authentication failed. Check GH_TOKEN.`), even when:
1.  `gh` CLI is installed and authenticated globally.
2.  `dotenv` is correctly loaded in the script.
3.  Other services like `GH_IssueService` (which also use `gh`) work perfectly fine.

This suggests a flaw in how `HealthService` executes its checks or interprets the environment in a standalone context versus the `npm run`-managed MCP server context.

## Reproduction
1.  Create a script using `GH_HealthService` from `ai/services.mjs`.
2.  Run it via `node my-script.mjs`.
3.  Observe failure.

## Goal
Fix `GH_HealthService` so it correctly detects the `gh` CLI status in standalone Node.js scripts, ensuring reliable "gatekeeping" for agents.


## Timeline

- 2025-11-29T16:23:27Z @tobiu added the `bug` label
- 2025-11-29T16:23:27Z @tobiu added the `ai` label
- 2025-11-29T16:23:32Z @tobiu added parent issue #7914
- 2025-11-29T16:24:29Z @tobiu cross-referenced by #7914
- 2025-11-29T16:40:01Z @tobiu assigned to @tobiu
- 2025-11-29T16:40:25Z @tobiu referenced in commit `bad28f9` - "Bug: GitHub HealthService fails in standalone SDK scripts #7930"
### @tobiu - 2025-11-29T16:41:29Z

**Input from Gemini 2.5 Agent:**

> ✦ # Resolution: Not a Bug
> 
> This issue was caused by incorrect consumption of the `HealthService` API in the `pm.mjs` script, not a defect in the service itself.
> 
> ## Root Cause
> The `GH_HealthService.healthcheck()` method returns a structured object:
> ```javascript
> {
>     status: 'healthy',
>     githubCli: {
>         authenticated: true,
>         // ...
>     }
> }
> ```
> 
> The `pm.mjs` script was checking `ghHealth.authenticated` (which is `undefined`) instead of `ghHealth.githubCli.authenticated`.
> 
> ## Fix
> The script has been updated to check the correct property. Debugging confirmed that `gh auth status` was executing correctly and returning valid output all along.
> 
> Closing as invalid/resolved.

- 2025-11-29T16:41:34Z @tobiu removed the `bug` label
- 2025-11-29T16:41:37Z @tobiu added the `invalid` label
- 2025-11-29T16:42:02Z @tobiu closed this issue

