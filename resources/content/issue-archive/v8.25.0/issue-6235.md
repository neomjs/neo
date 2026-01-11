---
id: 6235
title: 'grid.View: create a PoC to have the vertical scrollbar at the right edge of the wrapper container'
state: CLOSED
labels:
  - enhancement
  - help wanted
assignees: []
createdAt: '2025-01-14T21:27:19Z'
updatedAt: '2025-02-26T13:36:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6235'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-26T13:36:33Z'
---
# grid.View: create a PoC to have the vertical scrollbar at the right edge of the wrapper container

Right now, the scrollbar is at the right side of the view content:

![Image](https://github.com/user-attachments/assets/f98237fb-58c0-4ed7-89bd-f0949c821929)

It would of course be nicer, if it was at the right edge of the view wrapper => currently we can only see it in case we scroll the very right (last column visible) => we can not see it otherwise.

It might be possible with just a couple of CSS tweaks, but it probably is more tricky without breaking anything.

In case someone has a good idea, feel free to add a comment or send a PR. Thx!

## Timeline

- 2025-01-14T21:27:19Z @tobiu added the `enhancement` label
- 2025-01-14T21:27:19Z @tobiu added the `help wanted` label
- 2025-02-06T22:45:30Z @tobiu referenced in commit `18a717b` - "grid.View: create a PoC to have the vertical scrollbar at the right edge of the wrapper container #6235 first try"
- 2025-02-06T23:46:33Z @tobiu referenced in commit `e25a546` - "#6235 grid.Scrollbar: base class & scss"
- 2025-02-07T00:09:10Z @tobiu referenced in commit `49c0bc0` - "#6235 main.addon.ScrollSync: base class"
### @tobiu - 2025-02-26T13:36:33Z

already resolved.

- 2025-02-26T13:36:33Z @tobiu closed this issue

