---
id: 6588
title: 'worker.ServiceBase: onFetch() => limit caching to event.request.method === ''GET'''
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-03-25T10:36:15Z'
updatedAt: '2025-03-25T13:45:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6588'
author: tobiu
commentsCount: 0
parentIssue: 6584
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-25T13:45:40Z'
---
# worker.ServiceBase: onFetch() => limit caching to event.request.method === 'GET'

* We do not want caching for 'DELETE', 'PATCH', 'POST', 'PUT'

## Timeline

- 2025-03-25T10:36:15Z @tobiu added the `enhancement` label
- 2025-03-25T10:36:15Z @tobiu assigned to @tobiu
- 2025-03-25T10:36:16Z @tobiu added parent issue #6584
- 2025-03-25T13:45:01Z @tobiu referenced in commit `c6e6de4` - "worker.ServiceBase: onFetch() => limit caching to event.request.method === 'GET'#6588"
- 2025-03-25T13:45:41Z @tobiu closed this issue

