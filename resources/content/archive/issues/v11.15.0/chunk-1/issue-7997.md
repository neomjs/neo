---
id: 7997
title: Sanitize commander inputs in ai/demo-agents/pm.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T18:19:57Z'
updatedAt: '2025-12-02T18:30:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7997'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:30:43Z'
---
# Sanitize commander inputs in ai/demo-agents/pm.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to apply `sanitizeInput` to the `program` options in `ai/demo-agents/pm.mjs`.

**Implementation Details:**
- Import `sanitizeInput` from `../../buildScripts/util/Sanitizer.mjs`.
- Apply it as the 3rd argument to `.option()`.

References:
- `ai/demo-agents/pm.mjs`

## Timeline

- 2025-12-02T18:19:58Z @tobiu added the `bug` label
- 2025-12-02T18:19:58Z @tobiu added the `ai` label
- 2025-12-02T18:30:13Z @tobiu assigned to @tobiu
- 2025-12-02T18:30:32Z @tobiu referenced in commit `30c1882` - "Sanitize commander inputs in ai/demo-agents/pm.mjs #7997"
### @tobiu - 2025-12-02T18:30:37Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `ai/demo-agents/pm.mjs`.
> - Imported `sanitizeInput` from `../../buildScripts/util/Sanitizer.mjs`.
> - Applied `sanitizeInput` to `-e` option.

- 2025-12-02T18:30:43Z @tobiu closed this issue

