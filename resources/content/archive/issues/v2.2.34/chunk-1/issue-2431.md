---
id: 2431
title: 'plugin.Resizable: support for very fast drag OPs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-21T10:14:18Z'
updatedAt: '2021-06-21T14:03:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2431'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-21T10:14:44Z'
---
# plugin.Resizable: support for very fast drag OPs

This one took me quite a while to debug.

If you mouseDown on a resize handle inside `calendar.view.week.Component` and then move the cursor very fast and mouseUp, a drag OP will break.

The reason is that a drag OP will not start immediately => you need to move the cursor a bit.

If the mouse cursor is already outside of the resize handle dom node at this point, the plugin will remove the node from the dom.

Now, if we mouseUp, the mouse sensor will trigger the `drag:end` event on a node which still exists, but is no longer inside the DOM tree. The result is that the custom DOM event will no longer get received by the main thread addon => not by `calendar.view.week.EventDragZone` either.

To fix this, `plugin.Resizable` does need a `mousedown` and a `mouseup` dom event listener, which sets `isDragging` to true / false.

A mousedown event will then prevent the resize handle from getting removed.

If we trigger a mouseup event on the resize handle without starting a drag OP, the logic will be back in place => leaving the node via mousemove will remove the handle.

If we trigger mouseup outside of the resize handle node, the event won't get received, but then we do have started a drag OP and the `drag:end` logic will set `isDragging` to false anyway.

So, we are good in all cases.

## Timeline

- 2021-06-21T10:14:18Z @tobiu added the `enhancement` label
- 2021-06-21T10:14:18Z @tobiu assigned to @tobiu
- 2021-06-21T10:14:39Z @tobiu referenced in commit `47b880b` - "plugin.Resizable: support for very fast drag OPs #2431"
- 2021-06-21T10:14:44Z @tobiu closed this issue
### @keckeroo - 2021-06-21T14:03:23Z

👏 


