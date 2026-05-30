---
id: 16
title: Drag & Drop implementation
state: CLOSED
labels:
  - enhancement
  - help wanted
  - epic
assignees: []
createdAt: '2019-11-17T16:02:45Z'
updatedAt: '2024-08-31T08:54:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/16'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-31T08:54:10Z'
---
# Drag & Drop implementation

I found a very nice ES6 based (MIT licensed) example here:

https://shopify.github.io/draggable/

Source example:

https://github.com/Shopify/draggable/blob/master/src/Draggable/Draggable.js

I think neo.mjs should have a similar solution.

It will get a little bit tricky with our workers setup: Main needs to send the relevant events (dragstart, dragenter, dragleave, drop) to App to execute the handler logic, which will then adjust the DOM.

The only bigger issue is the "dragover" event, which fires incredibly often (could get buffered). In case a dragover-handler only uses trivial logic (e.g. no "this"), it could get moved to the main thread.

## Timeline

- 2019-11-17T16:02:45Z @tobiu added the `enhancement` label
- 2019-11-17T16:02:45Z @tobiu added the `help wanted` label
- 2019-11-17T16:02:56Z @tobiu added the `epic` label
- 2019-11-17T16:04:32Z @tobiu cross-referenced by #15
- 2019-11-17T16:23:04Z @tobiu cross-referenced by #18
- 2019-11-17T16:39:27Z @tobiu cross-referenced by #23
### @tobiu - 2024-08-31T08:54:10Z

already done.

- 2024-08-31T08:54:10Z @tobiu closed this issue

