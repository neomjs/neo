---
id: 7633
title: 'bug(mcp): list_labels tool fails with schema validation error'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-24T10:16:46Z'
updatedAt: '2025-10-24T12:41:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7633'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-24T12:41:07Z'
---
# bug(mcp): list_labels tool fails with schema validation error

The `list_labels` tool in the GitHub Workflow MCP server is failing with a schema validation error.

**Error Message:**
`MCP error -32602: Structured content does not match the tool's output schema: data.labels[18].description should be string`

**Analysis:**
This error likely occurs when a label in the repository has a `null` or empty description. The tool's output schema requires the `description` field to be a string, but the data returned from the GitHub API can have null descriptions, causing a mismatch.

**Acceptance Criteria:**
1.  Fix the `list_labels` tool to handle `null` or missing descriptions for labels.
2.  The tool should return a valid list of labels without causing a schema validation error, likely by coercing `null` descriptions to empty strings (`''`) before returning the data.

## Timeline

- 2025-10-24T10:16:47Z @tobiu added the `bug` label
- 2025-10-24T10:16:47Z @tobiu added the `ai` label
- 2025-10-24T12:26:51Z @tobiu assigned to @tobiu
- 2025-10-24T12:31:21Z @tobiu referenced in commit `7a4807c` - "bug(mcp): list_labels tool fails with schema validation error #7633"
- 2025-10-24T12:41:07Z @tobiu closed this issue

