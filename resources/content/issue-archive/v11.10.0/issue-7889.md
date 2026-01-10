---
id: 7889
title: Update Coding Guidelines for JSDoc and Refactor GitHub Workflow MCP
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-24T09:10:25Z'
updatedAt: '2025-11-24T09:40:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7889'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-24T09:40:53Z'
---
# Update Coding Guidelines for JSDoc and Refactor GitHub Workflow MCP

The current coding guidelines regarding JSDoc comments for class methods are insufficiently detailed, leading to inconsistencies in the codebase.

**Goals:**
1.  **Update `.github/CODING_GUIDELINES.md`:**
    *   Explicitly forbid empty lines between the method description and the first `@param` tag.
    *   Mandate descriptions for all `@param` tags.
    *   Mandate "Block Formatting" for parameters: vertically align types, parameter names, and descriptions.
    *   Standardize on not using hyphens (`-`) to separate parameter names from descriptions.

2.  **Refactor `ai/mcp/server/github-workflow`:**
    *   Apply these new rules to all services in `ai/mcp/server/github-workflow/services/`.

## Timeline

- 2025-11-24 @tobiu added the `documentation` label
- 2025-11-24 @tobiu added the `enhancement` label
- 2025-11-24 @tobiu added the `ai` label
- 2025-11-24 @tobiu assigned to @tobiu
- 2025-11-24 @tobiu referenced in commit `f4d7e9c` - "Update Coding Guidelines for JSDoc and Refactor GitHub Workflow MCP #7889"
- 2025-11-24 @tobiu closed this issue

