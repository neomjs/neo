---
id: 7995
title: Sanitize commander inputs in ai/mcp/server/github-workflow/mcp-stdio.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T18:19:43Z'
updatedAt: '2025-12-02T18:27:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7995'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:27:46Z'
---
# Sanitize commander inputs in ai/mcp/server/github-workflow/mcp-stdio.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to apply `sanitizeInput` to the `program` options in `ai/mcp/server/github-workflow/mcp-stdio.mjs`.

**Implementation Details:**
- Import `sanitizeInput` from `../../../../buildScripts/util/Sanitizer.mjs`.
- Apply it as the 3rd argument to `.option()`.

References:
- `ai/mcp/server/github-workflow/mcp-stdio.mjs`

## Comments

### @tobiu - 2025-12-02 18:27

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `ai/mcp/server/github-workflow/mcp-stdio.mjs`.
> - Imported `sanitizeInput` from `../../../../buildScripts/util/Sanitizer.mjs`.
> - Applied `sanitizeInput` to `-c` option.

## Activity Log

- 2025-12-02 @tobiu added the `bug` label
- 2025-12-02 @tobiu added the `ai` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `3178fd7` - "Sanitize commander inputs in ai/mcp/server/github-workflow/mcp-stdio.mjs #7995"
- 2025-12-02 @tobiu closed this issue

