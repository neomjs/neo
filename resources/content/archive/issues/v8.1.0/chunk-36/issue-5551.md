---
id: 5551
title: 'vdom.Helper: createDeltas() => separate deltas into default & remove'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-10T06:47:25Z'
updatedAt: '2024-07-10T07:03:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5551'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-10T07:03:00Z'
---
# vdom.Helper: createDeltas() => separate deltas into default & remove

after adding `removeAll`, our result deltas filtering feels no longer reasonable:

```
        deltas = [
            ...deltas.filter(item => item.action !== 'removeAll' && item.action !== 'removeNode'),
            ...deltas.filter(item => item.action === 'removeAll' || item.action === 'removeNode')
        ];
```

## Timeline

- 2024-07-10T06:47:25Z @tobiu added the `enhancement` label
- 2024-07-10T06:47:25Z @tobiu assigned to @tobiu
- 2024-07-10T06:59:18Z @tobiu referenced in commit `407cf76` - "vdom.Helper: createDeltas() => separate deltas into default & remove #5551"
- 2024-07-10T07:03:00Z @tobiu closed this issue

