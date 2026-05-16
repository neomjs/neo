---
id: 6296
title: 'component.Base: waitForDomRect()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-25T22:26:04Z'
updatedAt: '2025-01-25T22:28:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6296'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-25T22:28:23Z'
---
# component.Base: waitForDomRect()

There are still edge cases where a dialog does not show up properly:

![Image](https://github.com/user-attachments/assets/fc71be18-4dee-457a-897e-1e0ce1ef0341)

* Especially after a `await render(true)` call, a `DOMRect` might not have been layouted properly yet
* We do not want to add big delays for envs where they are not needed
* So, we need a generic solution to wait for a `DOMRect` being sized "soon"

## Timeline

- 2025-01-25T22:26:04Z @tobiu added the `enhancement` label
- 2025-01-25T22:26:04Z @tobiu assigned to @tobiu
- 2025-01-25T22:28:20Z @tobiu referenced in commit `9b783da` - "component.Base: waitForDomRect() #6296"
- 2025-01-25T22:28:23Z @tobiu closed this issue

