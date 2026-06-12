---
id: 2195
title: 'component.Base: smarter handling of styles'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-28T22:08:43Z'
updatedAt: '2021-05-28T22:09:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2195'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-28T22:09:19Z'
---
# component.Base: smarter handling of styles

`updateStyle()` is using `vnode.vnode.style = style;`. This can cause bugs, since vdom pseudo-style attributes are possible (e.g. height:10). we need an iteration.

`render()` should not need to pass `cls` or `style`.

the vdom setter should not need to apply style configs each time.

## Timeline

- 2021-05-28T22:08:43Z @tobiu added the `enhancement` label
- 2021-05-28T22:08:43Z @tobiu assigned to @tobiu
- 2021-05-28T22:09:16Z @tobiu referenced in commit `4c0e61e` - "component.Base: smarter handling of styles #2195"
- 2021-05-28T22:09:19Z @tobiu closed this issue

