---
id: 7980
title: Sanitize commander inputs in buildScripts/addConfig.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:41:55Z'
updatedAt: '2025-12-02T17:57:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7980'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T17:57:06Z'
---
# Sanitize commander inputs in buildScripts/addConfig.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/addConfig.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/addConfig.mjs`

## Timeline

- 2025-12-02T17:41:56Z @tobiu added the `bug` label
- 2025-12-02T17:41:56Z @tobiu added the `ai` label
- 2025-12-02T17:56:11Z @tobiu assigned to @tobiu
- 2025-12-02T17:56:30Z @tobiu referenced in commit `f9a0927` - "Sanitize commander inputs in buildScripts/addConfig.mjs #7980"
### @tobiu - 2025-12-02T17:56:44Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/addConfig.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Added meaningful descriptions for all CLI options.
> - Applied `sanitizeInput` to `-c`, `-d`, `-h`, `-n`, and `-t` options.

- 2025-12-02T17:57:06Z @tobiu closed this issue

