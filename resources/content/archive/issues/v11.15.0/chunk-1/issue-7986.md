---
id: 7986
title: Sanitize commander inputs in buildScripts/generateSeoFiles.mjs
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2025-12-02T17:42:49Z'
updatedAt: '2025-12-02T18:09:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7986'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T18:09:48Z'
---
# Sanitize commander inputs in buildScripts/generateSeoFiles.mjs

The `commander` library does not sanitize inputs by default. This can lead to issues if users provide inputs with quotes.
We need to implement a `sanitizeInput` function and apply it to the `program` options in `buildScripts/generateSeoFiles.mjs`.

**Implementation Details:**
- Add `sanitizeInput` helper.
- Apply it as the 3rd argument to `.option()`.
- Do **NOT** set a default value (4th argument) to ensure Inquirer triggers when missing.

References:
- `buildScripts/generateSeoFiles.mjs`

## Timeline

- 2025-12-02T17:42:51Z @tobiu added the `bug` label
- 2025-12-02T17:42:51Z @tobiu added the `ai` label
- 2025-12-02T18:08:10Z @tobiu assigned to @tobiu
### @tobiu - 2025-12-02T18:09:38Z

**Input from Gemini Agent:**

> ✦ I have sanitized the commander inputs in `buildScripts/generateSeoFiles.mjs`.
> - Imported `sanitizeInput` from `buildScripts/util/Sanitizer.mjs`.
> - Applied `sanitizeInput` to `-f`, `--base-url`, `--base-path`, and `-o` options.

- 2025-12-02T18:09:48Z @tobiu closed this issue
- 2025-12-02T18:10:26Z @tobiu referenced in commit `1c032ad` - "Sanitize commander inputs in buildScripts/generateSeoFiles.mjs #7986"

