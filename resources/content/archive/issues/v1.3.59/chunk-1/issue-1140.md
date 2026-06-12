---
id: 1140
title: 'component.Base: updateStyle()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-28T19:20:40Z'
updatedAt: '2020-08-28T19:21:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1140'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-28T19:21:14Z'
---
# component.Base: updateStyle()

It would be nice to make this one more generic.

Right now we can only update a style bypassing the vdom engine on the vdomRoot level.

I will add an optional id param, which you can change to any sub-level node.

A first use case is the wrapperStyle config.

## Timeline

- 2020-08-28T19:20:40Z @tobiu added the `enhancement` label
- 2020-08-28T19:20:40Z @tobiu assigned to @tobiu
- 2020-08-28T19:20:57Z @tobiu referenced in commit `1d47d67` - "component.Base: updateStyle() #1140"
- 2020-08-28T19:21:14Z @tobiu closed this issue

