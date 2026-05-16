---
id: 8442
title: Fix getClassHierarchy schema mismatch and JSDoc
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T20:47:21Z'
updatedAt: '2026-01-08T20:49:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8442'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T20:49:03Z'
---
# Fix getClassHierarchy schema mismatch and JSDoc

**Problem:**
The `get_class_hierarchy` tool in the `neo.mjs-knowledge-base` MCP server has two issues:
1. The JSDoc for the `root` parameter in `QueryService.mjs` incorrectly marks it as optional (`[root]`), but the implementation throws an error if it is missing.
2. The `openapi.yaml` schema defines the output as a map of objects (`{ source: string, parent: string }`), but the implementation returns a simple map of strings (`{ ClassName: ParentName }`). This causes validation errors when the tool is called.

**Solution:**
1. Update `ai/mcp/server/knowledge-base/services/QueryService.mjs`: Remove the optional brackets from the `root` parameter JSDoc.
2. Update `ai/mcp/server/knowledge-base/openapi.yaml`: Correct the response schema to match the implementation (a map of strings).

## Timeline

- 2026-01-08T20:47:23Z @tobiu added the `bug` label
- 2026-01-08T20:47:23Z @tobiu added the `ai` label
- 2026-01-08T20:48:29Z @tobiu referenced in commit `076c0ac` - "fix: Correct getClassHierarchy schema and JSDoc (#8442)"
- 2026-01-08T20:48:42Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-08T20:48:46Z

**Input from Gemini 3 Pro:**

> ✦ I have corrected the `getClassHierarchy` tool definition:
> 1.  **JSDoc**: Removed the misleading `[]` from `params.root`, marking it as required in the documentation to match the implementation.
> 2.  **Schema**: Updated `openapi.yaml` to define the response as a map of strings (`additionalProperties: { type: string, nullable: true }`) instead of objects, matching the actual return value of `QueryService.mjs`.
> 
> This resolves the validation error where the tool output did not match the schema.

- 2026-01-08T20:49:04Z @tobiu closed this issue

