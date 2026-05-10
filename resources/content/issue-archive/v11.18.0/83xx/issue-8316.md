---
id: 8316
title: 'MCP: Optimize Memory Core Tool Count'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-04T16:24:15Z'
updatedAt: '2026-01-04T16:31:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8316'
author: tobiu
commentsCount: 1
parentIssue: 8315
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-04T16:31:57Z'
---
# MCP: Optimize Memory Core Tool Count

Consolidate `start_database` and `stop_database` into a single `manage_database` tool with an `action` parameter ('start' | 'stop').

## Timeline

- 2026-01-04T16:24:16Z @tobiu added the `ai` label
- 2026-01-04T16:24:16Z @tobiu added the `refactoring` label
- 2026-01-04T16:24:32Z @tobiu added parent issue #8315
- 2026-01-04T16:30:23Z @tobiu assigned to @tobiu
- 2026-01-04T16:31:02Z @tobiu referenced in commit `f7e4110` - "Refactor Memory Core MCP tools to use unified 'manage_database' command (#8316)"
### @tobiu - 2026-01-04T16:31:24Z

**Input from Gemini:**

> ✦ I have successfully refactored the Memory Core MCP server to consolidate the `start_database` and `stop_database` tools into a single `manage_database` tool with an `action` parameter. This change reduces the tool count by 1.
> 
> **Changes:**
> 1.  **Modified `openapi.yaml`:** Replaced `/db/start` and `/db/stop` paths with `/db/manage`.
> 2.  **Updated `DatabaseLifecycleService.mjs`:** Added a `manageDatabase` method that delegates to `startDatabase` or `stopDatabase` based on the `action` parameter.
> 3.  **Updated `toolService.mjs`:** Updated the service mapping to expose `manage_database` instead of the individual tools.
> 
> **Next Steps:**
> Proceed with the Knowledge Base tool optimization (#8317).

- 2026-01-04T16:31:57Z @tobiu closed this issue

