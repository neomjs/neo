---
id: 1769
title: 'core.Base: ctor() => observable mixin check'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-14T13:18:32Z'
updatedAt: '2021-04-14T13:27:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1769'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-14T13:27:07Z'
---
# core.Base: ctor() => observable mixin check

Neo.mjs (the file) will now set the static config `observable` to true in case the mixin is included.

We can now simplify the ctor check.

## Timeline

- 2021-04-14T13:18:32Z @tobiu added the `enhancement` label
- 2021-04-14T13:18:32Z @tobiu assigned to @tobiu
- 2021-04-14T13:20:15Z @tobiu referenced in commit `c8929b3` - "core.Base: ctor() => observable mixin check #1769"
- 2021-04-14T13:27:07Z @tobiu closed this issue

