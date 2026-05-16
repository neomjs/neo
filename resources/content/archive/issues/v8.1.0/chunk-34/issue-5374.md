---
id: 5374
title: 'main.addon.IntersectionObserver: allow observe calls prior to register'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-03-27T17:50:22Z'
updatedAt: '2024-03-27T18:01:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5374'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-03-27T18:01:33Z'
---
# main.addon.IntersectionObserver: allow observe calls prior to register

after updating my chrome version, the timing seems to have changed.

the addon should be more robust:
if an observe request arrives before `register()`, we need to cache the data and then resolve it once the observer instance is in place.

## Timeline

- 2024-03-27T17:50:22Z @tobiu added the `enhancement` label
- 2024-03-27T17:50:22Z @tobiu assigned to @tobiu
- 2024-03-27T18:01:30Z @tobiu referenced in commit `5972447` - "main.addon.IntersectionObserver: allow observe calls prior to register #5374"
- 2024-03-27T18:01:33Z @tobiu closed this issue

