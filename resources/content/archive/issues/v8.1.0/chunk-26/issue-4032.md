---
id: 4032
title: 'toolbar.Base: the logic should not rely this much on dock positions'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-12T19:03:58Z'
updatedAt: '2023-02-12T19:04:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4032'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-12T19:04:19Z'
---
# toolbar.Base: the logic should not rely this much on dock positions

* a new default value for `dock` => null
* only override a layout in case there is a real dock value
* do not add a css rule for `dock: null`

this will allow us to use custom toolbar layouts.

## Timeline

- 2023-02-12T19:03:58Z @tobiu added the `enhancement` label
- 2023-02-12T19:03:58Z @tobiu assigned to @tobiu
- 2023-02-12T19:04:16Z @tobiu referenced in commit `85881d6` - "toolbar.Base: the logic should not rely this much on dock positions #4032"
- 2023-02-12T19:04:20Z @tobiu closed this issue

