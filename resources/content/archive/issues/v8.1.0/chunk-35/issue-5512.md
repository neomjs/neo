---
id: 5512
title: Neo.setupClass() => create a protection for not creating singleton instances more than once
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-02T08:33:04Z'
updatedAt: '2024-07-02T08:47:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5512'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-02T08:47:38Z'
---
# Neo.setupClass() => create a protection for not creating singleton instances more than once

The current singleton implementation works fine, in case we are sticking to one Neo.mjs version per app.

For the `LivePreview`, the dynamic code can not be bundled, so when trying to build the Portal app, it could happen that we have both, the `dist/production` and the `development` versions of neo in parallel.

In this case, singleton files will get pulled in from multiple locations (file-paths). `setupClass()` needs to check if the namespace already exists and if so, not create a new instance or override the ns.

## Timeline

- 2024-07-02T08:33:04Z @tobiu added the `enhancement` label
- 2024-07-02T08:33:04Z @tobiu assigned to @tobiu
- 2024-07-02T08:47:30Z @tobiu referenced in commit `f761db9` - "Neo.setupClass() => create a protection for not creating singleton instances more than once #5512"
- 2024-07-02T08:47:38Z @tobiu closed this issue

