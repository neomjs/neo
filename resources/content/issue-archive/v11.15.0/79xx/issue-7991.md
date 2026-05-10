---
id: 7991
title: Sanitize commander inputs in buildScripts/tools/createScss.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:43:00Z'
updatedAt: '2025-12-02T18:17:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7991'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:17:05Z'
---
# Sanitize commander inputs in buildScripts/tools/createScss.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/tools/createScss.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/tools/createScss.mjs`

## Timeline

- 2025-12-02T17:43:02Z @tobiu added the `bug` label
- 2025-12-02T17:43:02Z @tobiu added the `ai` label
- 2025-12-02T18:16:16Z @tobiu assigned to @tobiu
- 2025-12-02T18:16:44Z @tobiu referenced in commit `1a6b425` - "Sanitize commander inputs in buildScripts/tools/createScss.mjs #7991"
### @tobiu - 2025-12-02T18:16:56Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/tools/createScss.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Added descriptions for `-b` and `-c` options.
> - Applied `sanitizeInput` to `-b` and `-c` options.

- 2025-12-02T18:17:05Z @tobiu closed this issue

