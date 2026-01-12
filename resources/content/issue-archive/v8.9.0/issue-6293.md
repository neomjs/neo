---
id: 6293
title: 'component.Base: afterSetTheme()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-25T20:53:37Z'
updatedAt: '2025-01-25T20:54:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6293'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-25T20:54:02Z'
---
# component.Base: afterSetTheme()

* If we switch themes, we want child inheritance
* So, we need to ensure that the `oldValue` always does get removed on DOM level, even if the parent theme is the same
* Only trigger an update, in case there is a real change

## Timeline

- 2025-01-25T20:53:37Z @tobiu added the `enhancement` label
- 2025-01-25T20:53:37Z @tobiu assigned to @tobiu
- 2025-01-25T20:53:53Z @tobiu referenced in commit `72fd9e8` - "component.Base: afterSetTheme() #6293"
- 2025-01-25T20:54:02Z @tobiu closed this issue

