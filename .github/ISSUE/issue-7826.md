---
id: 7826
title: Extract JSON parsing logic into Neo.util.Json
state: OPEN
labels:
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2025-11-20T19:58:34Z'
updatedAt: '2025-11-20T19:58:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7826'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Extract JSON parsing logic into Neo.util.Json

Refactor the JSON parsing logic from `SessionService` into a reusable `Neo.util.Json` class.
This utility handles Markdown code block stripping (json/js/javascript) to reliably parse AI responses.

Related to #7825.

Tasks:
- Create `src/util/Json.mjs`
- Export in `src/util/_export.mjs`
- Use in `SessionService.mjs`

## Activity Log

- 2025-11-20 @tobiu added the `enhancement` label
- 2025-11-20 @tobiu added the `ai` label
- 2025-11-20 @tobiu added the `refactoring` label

