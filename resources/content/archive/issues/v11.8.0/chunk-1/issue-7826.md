---
id: 7826
title: Extract JSON parsing logic into Neo.util.Json
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-20T19:58:34Z'
updatedAt: '2025-11-20T19:59:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7826'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-20T19:59:40Z'
---
# Extract JSON parsing logic into Neo.util.Json

Refactor the JSON parsing logic from `SessionService` into a reusable `Neo.util.Json` class.
This utility handles Markdown code block stripping (json/js/javascript) to reliably parse AI responses.

Related to #7825.

Tasks:
- Create `src/util/Json.mjs`
- Export in `src/util/_export.mjs`
- Use in `SessionService.mjs`

## Timeline

- 2025-11-20T19:58:39Z @tobiu added the `enhancement` label
- 2025-11-20T19:58:40Z @tobiu added the `ai` label
- 2025-11-20T19:58:40Z @tobiu added the `refactoring` label
- 2025-11-20T19:58:53Z @tobiu assigned to @tobiu
- 2025-11-20T19:59:37Z @tobiu referenced in commit `1f7289e` - "Extract JSON parsing logic into Neo.util.Json #7826"
- 2025-11-20T19:59:40Z @tobiu closed this issue

