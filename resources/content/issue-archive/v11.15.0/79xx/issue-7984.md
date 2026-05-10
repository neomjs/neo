---
id: 7984
title: Sanitize commander inputs in buildScripts/createClass.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:42:41Z'
updatedAt: '2025-12-02T18:05:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7984'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:05:44Z'
---
# Sanitize commander inputs in buildScripts/createClass.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/createClass.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/createClass.mjs`

## Timeline

- 2025-12-02T17:42:43Z @tobiu added the `bug` label
- 2025-12-02T17:42:43Z @tobiu added the `ai` label
- 2025-12-02T18:05:18Z @tobiu assigned to @tobiu
- 2025-12-02T18:05:37Z @tobiu referenced in commit `2539041` - "Sanitize commander inputs in buildScripts/createClass.mjs #7984"
- 2025-12-02T18:05:44Z @tobiu closed this issue
### @tobiu - 2025-12-02T18:05:48Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/createClass.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Added descriptions for `-b`, `-c`, and `-r` options.
> - Applied `sanitizeInput` to `-n`, `-s`, `-b`, `-c`, and `-r` options.


