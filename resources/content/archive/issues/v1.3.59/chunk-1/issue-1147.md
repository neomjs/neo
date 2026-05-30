---
id: 1147
title: 'component.Base: afterSetWrapperStyle()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-28T22:27:07Z'
updatedAt: '2020-08-28T23:35:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1147'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-28T23:35:08Z'
---
# component.Base: afterSetWrapperStyle()

time to connect it to the new updateStyle() logic.

there is an edge case though => pretty often the top level node when using a wrapper does not have its own id.

this one will get synched in once the vnode is in place.

of course we still do want to be able to change wrapper styles before this happens.

## Timeline

- 2020-08-28T22:27:07Z @tobiu added the `enhancement` label
- 2020-08-28T22:27:07Z @tobiu assigned to @tobiu
### @tobiu - 2020-08-28T22:29:26Z

this ticket will need some polishing in related files as well.

- 2020-08-28T22:30:51Z @tobiu referenced in commit `9bad4bd` - "component.Base: afterSetWrapperStyle() #1147"
- 2020-08-28T23:35:09Z @tobiu closed this issue

