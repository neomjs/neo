---
id: 6860
title: new ServiceWorker versions are being stuck inside a waiting state
state: CLOSED
labels:
  - bug
  - enhancement
  - help wanted
  - good first issue
assignees: []
createdAt: '2025-06-24T12:16:39Z'
updatedAt: '2025-07-10T12:15:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6860'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-10T12:15:38Z'
---
# new ServiceWorker versions are being stuck inside a waiting state

* not v10 related
* I noticed a change how chrome handles SWs: before, deploying a new version automatically switched to the new SW, now it still starts, but keeps being locked inside a waiting state.
* We need to explore the code and ensure that `skipWaiting()` does get triggered.

<img width="806" alt="Image" src="https://github.com/user-attachments/assets/b9158166-4d6c-4fa9-ade0-967e2da0af3e" />

Since this is not directly related to the neo core, other interested devs could jump in on this one.

## Timeline

- 2025-06-24T12:16:40Z @tobiu added the `bug` label
- 2025-06-24T12:16:40Z @tobiu added the `enhancement` label
- 2025-06-24T12:16:41Z @tobiu added the `help wanted` label
- 2025-06-24T12:16:41Z @tobiu added the `good first issue` label
- 2025-07-10T12:15:31Z @tobiu referenced in commit `6d626f9` - "new ServiceWorker versions are being stuck inside a waiting state #6860"
- 2025-07-10T12:15:38Z @tobiu closed this issue

