---
id: 7558
title: Convert labelService to LabelService Neo.mjs Class
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-19T22:43:28Z'
updatedAt: '2025-10-19T22:47:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7558'
author: tobiu
commentsCount: 0
parentIssue: 7536
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-19T22:47:16Z'
---
# Convert labelService to LabelService Neo.mjs Class

**Reported by:** @tobiu on 2025-10-19

---

**Parent Issue:** #7536 - Epic: Integrate Neo.mjs Core into MCP Servers

---

This ticket covers refactoring `ai/mcp/server/github-workflow/services/labelService.mjs` into a singleton `LabelService` class that extends `Neo.core.Base`. This service is responsible for listing repository labels.

## Acceptance Criteria

1.  The file `ai/mcp/server/github-workflow/services/labelService.mjs` is renamed to `LabelService.mjs`.
2.  The content is replaced with a `LabelService` class that extends `Neo.core.Base` and is configured as a singleton.
3.  The existing `listLabels` function is converted into a class method.
4.  The `listLabels` method is updated to return a structured error object on failure, instead of throwing an exception.
5.  The `ai/mcp/server/github-workflow/services/toolService.mjs` is updated to use the new `LabelService` class.
6.  The `list_labels` tool continues to function correctly after the refactoring.

