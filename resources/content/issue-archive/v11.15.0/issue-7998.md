---
id: 7998
title: Sanitize commander inputs in ai/demo-agents/dev.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T18:20:04Z'
updatedAt: '2025-12-02T18:32:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7998'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:32:20Z'
---
# Sanitize commander inputs in ai/demo-agents/dev.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to apply `sanitizeInput` to the `program` options in `ai/demo-agents/dev.mjs`.

**Implementation Details:**
- Import `sanitizeInput` from `../../buildScripts/util/Sanitizer.mjs`.
- Apply it as the 3rd argument to `.option()`.

References:
- `ai/demo-agents/dev.mjs`

## Timeline

- 2025-12-02T18:20:05Z @tobiu added the `bug` label
- 2025-12-02T18:20:05Z @tobiu added the `ai` label
- 2025-12-02T18:30:54Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-02T18:31:55Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `ai/demo-agents/dev.mjs`.
> - Imported `sanitizeInput` from `../../buildScripts/util/Sanitizer.mjs`.
> - Applied `sanitizeInput` to `-i` option.

- 2025-12-02T18:32:01Z @tobiu referenced in commit `ea0a0b0` - "Sanitize commander inputs in ai/demo-agents/dev.mjs #7998"
- 2025-12-02T18:32:20Z @tobiu closed this issue

