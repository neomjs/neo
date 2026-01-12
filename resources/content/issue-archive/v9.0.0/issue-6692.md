---
id: 6692
title: 'container.Base: createItem() => moving an instance => keeping the previous controller chain, if needed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-05-02T22:05:12Z'
updatedAt: '2025-05-02T22:05:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6692'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-05-02T22:05:37Z'
---
# container.Base: createItem() => moving an instance => keeping the previous controller chain, if needed

Especially for moving components into different browser windows:
A component might rely on references & handler methods inside the previous controller realm


## Timeline

- 2025-05-02T22:05:12Z @tobiu added the `enhancement` label
- 2025-05-02T22:05:12Z @tobiu assigned to @tobiu
- 2025-05-02T22:05:30Z @tobiu referenced in commit `6f0d167` - "container.Base: createItem() => moving an instance => keeping the previous controller chain, if needed #6692"
- 2025-05-02T22:05:37Z @tobiu closed this issue

