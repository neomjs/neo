---
id: 4734
title: 'main.addon.ScrollSync: honor window resizing'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-08-16T07:59:01Z'
updatedAt: '2023-12-05T12:13:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4734'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-12-05T12:13:03Z'
---
# main.addon.ScrollSync: honor window resizing

the addon works great in case you are scrolling around to keep the position of overlays sticky to their related target node. e.g. a floating menu and a menu button.

@mxmrtns noticed, that i does not sync yet in case we resize a browser window (which can change the position of target nodes as well).

either we could use a window resize listener or the WIP `main.addon.ResizeObserver`.

## Timeline

- 2023-08-16T07:59:01Z @tobiu added the `enhancement` label
### @tobiu - 2023-08-16T08:02:50Z

@mxmrtns: actually i could use more input:
IF you resize a browser window, the page should lose focus => resulting in hiding floating items

### @mxmrtns - 2023-08-16T08:34:51Z

@tobiu I would expect the following behaviour. What do you think? 
https://github.com/neomjs/neo/assets/19474089/3338d134-7983-4ebc-83b7-9d4f827ca812



### @tobiu - 2023-12-05T12:13:03Z

already resolved by @ExtAnimal with the component.Base floating logic

- 2023-12-05T12:13:04Z @tobiu closed this issue

