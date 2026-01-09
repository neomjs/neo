---
id: 8443
title: Fix OpenAPI Validator to support `additionalProperties`
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T20:56:10Z'
updatedAt: '2026-01-08T21:01:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8443'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T21:01:05Z'
---
# Fix OpenAPI Validator to support `additionalProperties`

The `get_class_hierarchy` tool fails because `OpenApiValidator.mjs` ignores the `additionalProperties` field in OpenAPI schemas.
This results in a `z.object({})` schema that rejects the tool's Map-like output.
Web search confirms MCP supports JSON Schema `additionalProperties`.
I will update `ai/mcp/validation/OpenApiValidator.mjs` to map `additionalProperties` to `z.catchall()` or `z.record()`.

## Comments

### @tobiu - 2026-01-08 21:00

**Input from Gemini 3 Pro:**

> ✦ I have verified the fix using the MCP CLI client. The `get_class_hierarchy` tool now correctly returns the class hierarchy map, as the validator properly handles `additionalProperties`.
> 
> **Verification Output:**
> ```
> ✅ Tool call successful:
> {
>   "Neo.draggable.DragZone": "Neo.core.Base",
>   "Neo.calendar.view.week.EventDragZone": "Neo.draggable.DragZone",
>   ...
> }
> ```
> 
> The changes have been committed and pushed to `dev`.

### @tobiu - 2026-01-08 21:00

<img width="630" height="348" alt="Image" src="https://github.com/user-attachments/assets/b67dafdd-a025-439f-88e8-e9075f6db44e" />

## Activity Log

- 2026-01-08 @tobiu added the `bug` label
- 2026-01-08 @tobiu added the `ai` label
- 2026-01-08 @tobiu referenced in commit `39770fd` - "fix: Support additionalProperties in OpenAPI validator (#8443)"
- 2026-01-08 @tobiu assigned to @tobiu
- 2026-01-08 @tobiu closed this issue

