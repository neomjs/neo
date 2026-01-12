---
id: 7990
title: Sanitize commander inputs in buildScripts/tools/createExample.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:42:58Z'
updatedAt: '2025-12-02T18:16:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7990'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:16:01Z'
---
# Sanitize commander inputs in buildScripts/tools/createExample.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/tools/createExample.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/tools/createExample.mjs`

## Timeline

- 2025-12-02T17:42:59Z @tobiu added the `bug` label
- 2025-12-02T17:42:59Z @tobiu added the `ai` label
- 2025-12-02T18:15:29Z @tobiu assigned to @tobiu
- 2025-12-02T18:15:51Z @tobiu referenced in commit `f72bc68` - "Sanitize commander inputs in buildScripts/tools/createExample.mjs #7990"
### @tobiu - 2025-12-02T18:15:53Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/tools/createExample.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Added descriptions for `-b` and `-c` options.
> - Applied `sanitizeInput` to `-b` and `-c` options.

- 2025-12-02T18:16:01Z @tobiu closed this issue

