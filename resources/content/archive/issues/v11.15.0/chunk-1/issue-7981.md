---
id: 7981
title: Sanitize commander inputs in buildScripts/createAppMinimal.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:41:58Z'
updatedAt: '2025-12-02T17:59:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7981'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T17:59:12Z'
---
# Sanitize commander inputs in buildScripts/createAppMinimal.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/createAppMinimal.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/createAppMinimal.mjs`

## Timeline

- 2025-12-02T17:41:59Z @tobiu added the `bug` label
- 2025-12-02T17:41:59Z @tobiu added the `ai` label
- 2025-12-02T17:58:20Z @tobiu assigned to @tobiu
- 2025-12-02T17:58:50Z @tobiu referenced in commit `7314b80` - "Sanitize commander inputs in buildScripts/createAppMinimal.mjs #7981"
### @tobiu - 2025-12-02T17:58:56Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/createAppMinimal.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Added description for `-a` option.
> - Applied `sanitizeInput` to `-a`, `-m`, `-s`, `-t`, and `-u` options.

- 2025-12-02T17:59:12Z @tobiu closed this issue

