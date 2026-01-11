---
id: 7989
title: Sanitize commander inputs in buildScripts/createComponent.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:42:56Z'
updatedAt: '2025-12-02T18:14:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7989'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:14:46Z'
---
# Sanitize commander inputs in buildScripts/createComponent.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/createComponent.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/createComponent.mjs`

## Timeline

- 2025-12-02T17:42:56Z @tobiu added the `bug` label
- 2025-12-02T17:42:57Z @tobiu added the `ai` label
- 2025-12-02T18:14:06Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-02T18:14:29Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/createComponent.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Added descriptions for `-b` and `-c` options.
> - Applied `sanitizeInput` to `-n`, `-s`, `-b`, and `-c` options.

- 2025-12-02T18:14:29Z @tobiu referenced in commit `8a334dc` - "Sanitize commander inputs in buildScripts/createComponent.mjs #7989"
- 2025-12-02T18:14:46Z @tobiu closed this issue

