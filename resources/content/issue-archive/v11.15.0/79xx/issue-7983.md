---
id: 7983
title: Sanitize commander inputs in buildScripts/buildThemes.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:42:03Z'
updatedAt: '2025-12-02T18:04:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7983'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:03:57Z'
---
# Sanitize commander inputs in buildScripts/buildThemes.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/buildThemes.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/buildThemes.mjs`

## Timeline

- 2025-12-02T17:42:04Z @tobiu added the `bug` label
- 2025-12-02T17:42:04Z @tobiu added the `ai` label
- 2025-12-02T18:03:25Z @tobiu assigned to @tobiu
- 2025-12-02T18:03:50Z @tobiu referenced in commit `208a6bc` - "Sanitize commander inputs in buildScripts/buildThemes.mjs #7983"
- 2025-12-02T18:03:57Z @tobiu closed this issue
### @tobiu - 2025-12-02T18:04:05Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/buildThemes.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Applied `sanitizeInput` to `-e` and `-t` options.


