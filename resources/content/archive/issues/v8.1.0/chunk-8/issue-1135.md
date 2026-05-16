---
id: 1135
title: 'tab.Strip: moveActiveIndicator()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-25T12:40:50Z'
updatedAt: '2020-08-25T13:39:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1135'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-25T13:39:03Z'
---
# tab.Strip: moveActiveIndicator()

there should be a check if the vnode already exists.

changes which happen before the rendering / mounting (e.g. through hash changes) should not trigger animations.

looking into it.

## Timeline

- 2020-08-25T12:40:50Z @tobiu added the `enhancement` label
- 2020-08-25T12:40:50Z @tobiu assigned to @tobiu
- 2020-08-25T13:38:28Z @tobiu referenced in commit `fcb200a` - "tab.Strip: moveActiveIndicator() #1135"
### @tobiu - 2020-08-25T13:39:03Z

not as easy as i thought. needed some refactoring to do it in a smarter way.

- 2020-08-25T13:39:03Z @tobiu closed this issue

