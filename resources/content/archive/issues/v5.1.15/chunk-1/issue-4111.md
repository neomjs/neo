---
id: 4111
title: 'component.Base: hidden'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-02-21T10:54:50Z'
updatedAt: '2023-02-21T10:55:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4111'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-21T10:55:46Z'
---
# component.Base: hidden

this config is not always working as intended, especially when used with bindings (resulting in `set()` calls).

we should stronger move it towards `mount()` & `unmount()`.

@Dinkh 

## Timeline

- 2023-02-21T10:54:51Z @tobiu added the `bug` label
- 2023-02-21T10:54:51Z @tobiu assigned to @tobiu
- 2023-02-21T10:55:13Z @tobiu referenced in commit `ee4643e` - "component.Base: hidden #4111"
### @tobiu - 2023-02-21T10:55:46Z

this push is a hotfix candidate which requires more testing.

https://user-images.githubusercontent.com/1177434/220325892-420ef871-2a5b-4cdd-97cb-f19841783a94.mov



- 2023-02-21T10:55:46Z @tobiu closed this issue

