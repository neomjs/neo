---
id: 7608
title: 'Bug: `get_pull_request_diff` Fails Schema Validation Due to Raw String Output'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-10-22T12:29:58Z'
updatedAt: '2025-10-22T12:30:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7608'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-22T12:30:41Z'
---
# Bug: `get_pull_request_diff` Fails Schema Validation Due to Raw String Output

When calling the `get_pull_request_diff` tool, the operation fails with the error: `MCP error -32600: Structured content does not match the tool's output schema: data should NOT have additional properties`.

### Root Cause

An investigation revealed a mismatch between the `PullRequestService.getPullRequestDiff` implementation and the expectations of the generic `toolService`.

1.  **OpenAPI Definition**: The `openapi.yaml` correctly defines the response for this endpoint as `text/plain`.
2.  **Tool Service Behavior**: The generic `toolService.mjs`, when it encounters a `text/plain` response type, wraps the output schema in a JSON object for client compatibility. It expects the tool's handler to return a JSON object of the shape `{ "result": "..." }`.
3.  **Service Implementation**: The `PullRequestService.getPullRequestDiff` method currently returns the raw string output (`stdout`) from the `gh pr diff` command, not a JSON object.

This discrepancy causes the tool's output validation to fail.

## Resolution

The `getPullRequestDiff` method in `ai/mcp/server/github-workflow/services/PullRequestService.mjs` needs to be modified. Instead of returning the raw `stdout` string, it must return a JSON object that conforms to the structure expected by the tool service:

```javascript
// Current incorrect return value
return stdout;

// Required correct return value
return { result: stdout };
```

This will align the service's output with the tool's schema, resolving the validation error.

## Timeline

- 2025-10-22T12:29:59Z @tobiu assigned to @tobiu
- 2025-10-22T12:30:00Z @tobiu added the `bug` label
- 2025-10-22T12:30:01Z @tobiu added the `ai` label
- 2025-10-22T12:30:24Z @tobiu referenced in commit `800b798` - "Bug: get_pull_request_diff Fails Schema Validation Due to Raw String Output #7608"
- 2025-10-22T12:30:42Z @tobiu closed this issue

