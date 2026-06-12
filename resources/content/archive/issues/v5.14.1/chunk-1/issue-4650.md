---
id: 4650
title: 'worker.App: createNeoInstance() remote method'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-08-06T08:33:49Z'
updatedAt: '2023-08-06T08:34:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4650'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-08-06T08:34:47Z'
---
# worker.App: createNeoInstance() remote method

exposed to main threads.

it would be nice, in case we can create new neo components directly from within main threads.

we want to pass config objects to the app worker. be aware though, that we can only pass configs which can get converted into JSON (meaning no modules / classes or instances).

## Timeline

- 2023-08-06T08:33:49Z @tobiu added the `enhancement` label
- 2023-08-06T08:33:49Z @tobiu assigned to @tobiu
- 2023-08-06T08:34:44Z @tobiu referenced in commit `d050071` - "worker.App: createNeoInstance() remote method #4650"
- 2023-08-06T08:34:47Z @tobiu closed this issue
- 2023-08-06T08:46:57Z @tobiu cross-referenced by #4651

