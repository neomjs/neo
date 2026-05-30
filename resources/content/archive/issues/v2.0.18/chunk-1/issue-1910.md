---
id: 1910
title: 'component.Base: boolean hasScssFile public static class field'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-04-30T16:52:50Z'
updatedAt: '2021-05-05T08:05:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1910'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-05T08:05:35Z'
---
# component.Base: boolean hasScssFile public static class field

needs to get applied to all classes extending component.Base.

not 100% sure if this already works in safari:
https://bugs.webkit.org/show_bug.cgi?id=194095

the ticket is resolved since dev 2020, not sure if it got deployed to the non tech preview version already.

if not, we could use a non static field or a static config.

## Timeline

- 2021-04-30T16:52:50Z @tobiu added the `enhancement` label
### @tobiu - 2021-05-05T08:05:35Z

new strategy: we store the related infos inside a json file.

- 2021-05-05T08:05:35Z @tobiu closed this issue

