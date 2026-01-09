---
id: 7982
title: Sanitize commander inputs in buildScripts/createApp.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:42:01Z'
updatedAt: '2025-12-02T18:02:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7982'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:00:27Z'
---
# Sanitize commander inputs in buildScripts/createApp.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/createApp.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/createApp.mjs`

## Comments

### @tobiu - 2025-12-02 18:02

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/createApp.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Added description for `-a` option.
> - Applied `sanitizeInput` to `-a`, `-m`, `-s`, `-t`, and `-u` options.

## Activity Log

- 2025-12-02 @tobiu added the `bug` label
- 2025-12-02 @tobiu added the `ai` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `30c1e19` - "Sanitize commander inputs in buildScripts/createApp.mjs #7982"
- 2025-12-02 @tobiu closed this issue

