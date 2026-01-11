---
id: 7674
title: 'Fix(toolService): Create union type for multiple response schemas'
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-10-27T11:35:33Z'
updatedAt: '2025-10-27T12:06:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7674'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-27T12:06:45Z'
---
# Fix(toolService): Create union type for multiple response schemas

The `toolService.mjs` was not correctly interpreting the OpenAPI specification to create a comprehensive output schema for tools. It only considered success responses (200, 201, 202), ignoring defined error responses (e.g., 500, 404).

This caused the MCP client to reject valid error objects returned by tools, as they did not match the success-only output schema.

This ticket covers the fix implemented in `buildOutputZodSchema` to iterate over all possible responses for an operation and combine their schemas into a `z.union()` type. This ensures the generated `outputSchema` accurately reflects all possible return shapes (both success and error), making the tool definitions more robust.

## Timeline

- 2025-10-27T11:35:35Z @tobiu added the `bug` label
- 2025-10-27T11:35:35Z @tobiu added the `ai` label
- 2025-10-27T11:35:35Z @tobiu added the `refactoring` label
- 2025-10-27T11:35:49Z @tobiu assigned to @tobiu
- 2025-10-27T12:06:45Z @tobiu closed this issue

