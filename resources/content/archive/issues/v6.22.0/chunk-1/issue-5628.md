---
id: 5628
title: 'main.DomEvents: addDomListener() => throws JS error, in case the target node is not found'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-07-26T20:57:08Z'
updatedAt: '2024-07-26T21:19:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5628'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-26T21:19:31Z'
---
# main.DomEvents: addDomListener() => throws JS error, in case the target node is not found

Instead, it should log a warning in dev-mode and return the success-state back to the app worker.

![Screenshot 2024-07-26 at 22 55 38](https://github.com/user-attachments/assets/e1f527cf-0e1c-44ad-a069-a1f92c892b61)


## Timeline

- 2024-07-26T20:57:08Z @tobiu added the `bug` label
- 2024-07-26T20:57:08Z @tobiu assigned to @tobiu
- 2024-07-26T21:19:23Z @tobiu referenced in commit `d9e7349` - "main.DomEvents: addDomListener() => throws JS error, in case the target node is not found #5628"
- 2024-07-26T21:19:31Z @tobiu closed this issue

