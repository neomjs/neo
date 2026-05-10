---
id: 8198
title: '[Memory Core] Fix timestamp schema validation error in get_all_summaries'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-29T05:13:28Z'
updatedAt: '2025-12-29T05:20:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8198'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T05:20:45Z'
---
# [Memory Core] Fix timestamp schema validation error in get_all_summaries

The `get_all_summaries` tool fails with a schema validation error because it returns a numeric timestamp from ChromaDB, while the OpenAPI schema expects an ISO 8601 string.

**Error:**
`MCP error -32602: Structured content does not match the tool's output schema: data/summaries/0/timestamp must be string`

**Proposed Fix:**
Update `ai/mcp/server/memory-core/services/SummaryService.mjs` to convert the `timestamp` metadata to an ISO string in both `listSummaries` and `querySummaries`.

## Timeline

- 2025-12-29T05:13:29Z @tobiu added the `bug` label
- 2025-12-29T05:13:29Z @tobiu added the `ai` label
- 2025-12-29T05:13:50Z @tobiu assigned to @tobiu
- 2025-12-29T05:20:36Z @tobiu referenced in commit `d0eab0a` - "[Memory Core] Fix timestamp schema validation error in get_all_summaries #8198"
- 2025-12-29T05:20:45Z @tobiu closed this issue

