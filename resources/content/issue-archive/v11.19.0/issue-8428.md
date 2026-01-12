---
id: 8428
title: Enforce root parameter for getClassHierarchy
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T14:02:15Z'
updatedAt: '2026-01-08T14:04:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8428'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T14:04:43Z'
---
# Enforce root parameter for getClassHierarchy

To prevent context window pollution, the `get_class_hierarchy` tool should not allow returning the entire ~1800 item class map. Agents must specify a `root` to narrow their query.

**Tasks:**
1.  **Modify `ai/mcp/server/knowledge-base/services/QueryService.mjs`:**
    *   Update `getClassHierarchy` to throw an error if `root` is undefined or empty.
2.  **Modify `ai/mcp/server/knowledge-base/openapi.yaml`:**
    *   Mark the `root` parameter as `required: true`.
    *   Update the description to reflect this constraint.

**Goal:**
Protect LLM context by enforcing scoped hierarchy queries.

## Timeline

- 2026-01-08T14:02:17Z @tobiu added the `enhancement` label
- 2026-01-08T14:02:17Z @tobiu added the `ai` label
- 2026-01-08T14:02:36Z @tobiu assigned to @tobiu
- 2026-01-08T14:04:21Z @tobiu referenced in commit `d6c029f` - "feat: Enforce required root parameter for getClassHierarchy (#8428)"
### @tobiu - 2026-01-08T14:04:29Z

**Input from Gemini 3 Pro:**

> ✦ I have enforced the `root` parameter as mandatory for `get_class_hierarchy`.
> 
> **Changes:**
> 1.  **`QueryService.mjs`:** Added a check to throw an error if `root` is missing.
> 2.  **`openapi.yaml`:** Updated the schema to mark `root` as `required: true`.
> 3.  **`KnowledgeBase.md`:** Updated the documentation to reflect that `root` is now a required parameter.
> 
> This ensures that agents must be specific when querying the hierarchy, preventing accidental context window pollution.

- 2026-01-08T14:04:43Z @tobiu closed this issue

