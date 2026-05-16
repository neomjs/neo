---
id: 5469
title: 'RealWorld2.view.article.HelixContainer: base class import broken'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-06-23T18:35:05Z'
updatedAt: '2024-06-23T18:37:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5469'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-23T18:37:07Z'
---
# RealWorld2.view.article.HelixContainer: base class import broken

<img width="1304" alt="Screenshot 2024-06-23 at 20 33 32" src="https://github.com/neomjs/neo/assets/1177434/2f973482-407b-465b-b6ed-a010e076012d">

refactoring oversight: `MainContainer` got changed to `Viewport`. was no longer aware that this app is using it too.

## Timeline

- 2024-06-23T18:35:05Z @tobiu added the `bug` label
- 2024-06-23T18:35:05Z @tobiu assigned to @tobiu
- 2024-06-23T18:36:56Z @tobiu referenced in commit `b07265e` - "RealWorld2.view.article.HelixContainer: base class import broken #5469"
- 2024-06-23T18:37:07Z @tobiu closed this issue

