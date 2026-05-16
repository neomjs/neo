---
id: 4552
title: 'component.Video: cleanup'
state: CLOSED
labels:
  - enhancement
assignees:
  - Dinkh
createdAt: '2023-07-17T15:09:18Z'
updatedAt: '2024-07-31T20:49:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4552'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-31T20:49:16Z'
---
# component.Video: cleanup

hi torsten,

a couple of thoughts:

1) in case you are not using the vdom reference, don't assign it to a variable. we can use `this.update()` instead of `this.vdom = vdom`. already changed in all other spots inside the framework.
example: https://github.com/neomjs/neo/blob/dev/src/button/Base.mjs#L169

2) same pattern for domListeners => `this.addDomListeners()`
example: https://github.com/neomjs/neo/blob/dev/src/button/Base.mjs#L181

3) the `playing_` config defaults to false. on DOM level there is `autoplay: true` though. i guess autoPlay could be a config on its own.

please drop a comment in case you want me to add the changes.



## Timeline

- 2023-07-17T15:09:18Z @tobiu added the `enhancement` label
- 2023-07-17T15:09:19Z @tobiu assigned to @Dinkh
### @Dinkh - 2024-07-31T19:54:54Z

autoplay is used to immediately start playing the video, when you click the ghost.
I will add a autoplay functionality anyways.

- 2024-07-31T20:47:51Z @Dinkh referenced in commit `c1c9688` - "#4552 added autoplay"
### @Dinkh - 2024-07-31T20:49:16Z

fixed and added autoplay

- 2024-07-31T20:49:16Z @Dinkh closed this issue

