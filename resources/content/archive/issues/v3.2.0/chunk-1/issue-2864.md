---
id: 2864
title: 'Triangle-based worker communication for app => vdom => main => app '
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-02-05T14:32:01Z'
updatedAt: '2022-02-05T15:51:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2864'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-02-05T15:51:59Z'
---
# Triangle-based worker communication for app => vdom => main => app 

In case we render & mount a component or in case we do a vdom update, the worker messages are running like this:
**app => main => vdom => main => app**

We can reduce this to:
**app => vdom => main => app**

<img width="438" alt="Screenshot 2022-02-05 at 13 02 55" src="https://user-images.githubusercontent.com/1177434/152645890-ffa2efc6-015f-4c9d-b1c1-08e70e706c7b.png">

To do this, we need to create a new `MessageChannel` for the vdom worker, similar to the ones for the canvas and data workers. However, we only need to register one port (since messages back from vdom still need to drop the deltas inside main).

We still want to delay sending a reply from main to app until the deltas got processed by the `renderAnimationFrame` queue.

## Timeline

- 2022-02-05T14:32:01Z @tobiu added the `enhancement` label
- 2022-02-05T14:32:02Z @tobiu assigned to @tobiu
- 2022-02-05T14:32:45Z @tobiu referenced in commit `0905630` - "Triangle-based worker communication for app => vdom => main => app #2864"
- 2022-02-05T14:35:10Z @tobiu referenced in commit `28467dd` - "#2864 worker.VDom: removed the testing logs for direct messages from App"
- 2022-02-05T14:44:06Z @tobiu referenced in commit `2d8a3e6` - "#2864 comment linking to the ticket"
### @tobiu - 2022-02-05T15:44:58Z

to enable the same pattern for the `SharedWorker` scope, we need to match worker ports and appNames inside all available workers.

- 2022-02-05T15:48:39Z @tobiu referenced in commit `eaa0f5e` - "#2864 support for the shared workers scope"
- 2022-02-05T15:51:59Z @tobiu closed this issue

