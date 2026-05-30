---
id: 5517
title: 'layout.Cube: enable containers to switch to different layouts at run-time'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-07-02T21:06:22Z'
updatedAt: '2024-07-08T15:09:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5517'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-07-08T15:09:51Z'
---
# layout.Cube: enable containers to switch to different layouts at run-time

* add a radio to switch to vbox into the example app
* restore the original vdom structure
* restore the `getVdomItemsRoot()` override
* remove child css rules

## Timeline

- 2024-07-02T21:06:22Z @tobiu added the `enhancement` label
- 2024-07-02T21:06:23Z @tobiu assigned to @tobiu
- 2024-07-02T21:11:01Z @tobiu referenced in commit `791852c` - "#5517 examples.layout.cube.MainContainer: added 2 radios to switch between layout cube & vbox"
- 2024-07-02T21:12:41Z @tobiu referenced in commit `93e27ff` - "#5517 examples.layout.cube.MainContainer: increased the default size"
- 2024-07-02T21:35:56Z @tobiu referenced in commit `a0b11ed` - "#5517 layout.Cube: removeChildAttributes()"
- 2024-07-02T21:36:40Z @tobiu referenced in commit `3446a28` - "#5517 layout.*: fixed the removeChildAttributes() signature => added the 2nd param to all missing implementations"
### @tobiu - 2024-07-03T15:33:34Z

blocked by: https://github.com/neomjs/neo/issues/5518

- 2024-07-03T15:40:58Z @tobiu referenced in commit `218ea5c` - "#5517 layout.Cube: logic to rebuild the original DOM structure"
### @tobiu - 2024-07-08T15:09:51Z

resolved.

- 2024-07-08T15:09:51Z @tobiu closed this issue

