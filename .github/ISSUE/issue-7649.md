---
id: 7649
title: >-
  Feat: Make `agent` parameter required for `create_comment` tool and simplify
  implementation
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T16:04:58Z'
updatedAt: '2025-10-25T16:08:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7649'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T16:08:10Z'
---
# Feat: Make `agent` parameter required for `create_comment` tool and simplify implementation

**Reported by:** @tobiu on 2025-10-25

This ticket documents the change to make the `agent` parameter a required input for the `create_comment` tool, and the subsequent simplification of the `createComment` method in `PullRequestService.mjs`.

**Motivation:**
Making the `agent` parameter required improves the contract of the `create_comment` tool, ensuring that all comments made by agents are properly attributed and formatted with an icon. This also allows for a simplification of the underlying `createComment` method by removing conditional logic for the `agent` parameter's presence.

**Changes Implemented:**

1.  **OpenAPI Definition Update (Prerequisite):**
    *   The `agent` parameter in the `create_comment` tool's `requestBody` schema has been moved from the `properties` section to the `required` array. This ensures that the `agent` string is always provided when calling the tool.

2.  **`PullRequestService.mjs` Simplification:**
    *   The `createComment` method in `ai/mcp/server/github-workflow/services/PullRequestService.mjs` has been simplified. The `if (agent)` conditional check has been removed, as the `agent` parameter is now guaranteed to be present.
    *   The logic for constructing `finalBody` now directly incorporates the agent's header and icon, streamlining the comment formatting process.

This change enhances the robustness of agent comments and simplifies the codebase.

