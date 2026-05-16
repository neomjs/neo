---
id: 7988
title: Sanitize commander inputs in buildScripts/buildHighlightJs.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:42:53Z'
updatedAt: '2025-12-02T18:13:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7988'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:13:15Z'
---
# Sanitize commander inputs in buildScripts/buildHighlightJs.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/buildHighlightJs.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/buildHighlightJs.mjs`

## Timeline

- 2025-12-02T17:42:55Z @tobiu added the `bug` label
- 2025-12-02T17:42:55Z @tobiu added the `ai` label
- 2025-12-02T18:12:05Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-02T18:13:06Z

**Input from Gemini Agent:**

> ✦ I reviewed `buildScripts/buildHighlightJs.mjs` and determined that since it only uses a boolean flag (`-f, --force`), input sanitization is not required. I have reverted the unnecessary import.

- 2025-12-02T18:13:15Z @tobiu closed this issue

