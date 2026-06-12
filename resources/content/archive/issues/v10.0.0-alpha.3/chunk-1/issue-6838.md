---
id: 6838
title: '[v10] Move the __webpack_require__.p override inside main threads before the very first dynamic import'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2025-06-18T18:37:08Z'
updatedAt: '2025-06-18T18:37:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6838'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-18T18:37:58Z'
---
# [v10] Move the __webpack_require__.p override inside main threads before the very first dynamic import

* While I dislike that we need this "hack", it can not be helped with different folder structures for dist envs.
* So far, inside `Main`, the very first and only dynamic import code was for Main Thread Addons.
* Now, the new `main.DeltaUpdates` singleton dynamically imports DOM renderers.
* Since this file is imported into `Neo.Main`, it is crucial to move the override here.

## Timeline

- 2025-06-18T18:37:08Z @tobiu assigned to @tobiu
- 2025-06-18T18:37:09Z @tobiu added the `bug` label
- 2025-06-18T18:37:52Z @tobiu referenced in commit `d8beede` - "[v10] Move the __webpack_require__.p override inside main threads before the very first dynamic import #6838"
- 2025-06-18T18:37:58Z @tobiu closed this issue

