---
id: 7499
title: Implement Conditional Omission of Optional Fields in MCP Tool Definitions
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-15T13:55:21Z'
updatedAt: '2025-10-15T13:56:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7499'
author: tobiu
commentsCount: 0
parentIssue: 7477
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-15T13:56:24Z'
---
# Implement Conditional Omission of Optional Fields in MCP Tool Definitions

The MCP specification defines several optional fields in tool definitions (e.g., `outputSchema`, `annotations`). To ensure strict compliance and avoid sending `null` values for absent optional fields, this ticket implements conditional omission of these fields from the `tools/list` response.

## Acceptance Criteria

1.  `toolService.mjs` is modified such that `buildOutputZodSchema` returns `null` when no output schema is found.
2.  `toolService.mjs` is modified such that `outputSchema` is only included in the `allToolsForListing` array if `outputJsonSchema` is not `null`.
3.  `toolService.mjs` is modified such that `annotations` is only included in the `allToolsForListing` array if `operation['x-annotations']` is not `null`.
4.  The `tools/list` response correctly omits `outputSchema` and `annotations` when they are not present.

## Timeline

- 2025-10-15T13:55:21Z @tobiu assigned to @tobiu
- 2025-10-15T13:55:23Z @tobiu added the `enhancement` label
- 2025-10-15T13:55:23Z @tobiu added the `ai` label
- 2025-10-15T13:55:23Z @tobiu added parent issue #7477
- 2025-10-15T13:56:14Z @tobiu referenced in commit `ada1188` - "Implement Conditional Omission of Optional Fields in MCP Tool Definitions #7499"
- 2025-10-15T13:56:24Z @tobiu closed this issue

