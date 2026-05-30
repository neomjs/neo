---
id: 1504
title: 'draggable.DragZone: onAfterDragStart()'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - stale
assignees: []
createdAt: '2021-02-02T12:59:39Z'
updatedAt: '2024-09-19T02:30:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1504'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-19T02:30:32Z'
---
# draggable.DragZone: onAfterDragStart()

Flagging this issue as "good first issue" & "help wanted", since it is an easy one.

Move the logic inside the promise callback of dragStart() into a new method.

```
        Neo.main.DomAccess.getBoundingClientRect({
            id: me.getDragElementRoot().id
        }).then(rect => {
            offsetX = data.clientX - rect.left;
            offsetY = data.clientY - rect.top;

            Object.assign(me, {
                dragElementRect: rect,
                offsetX        : offsetX,
                offsetY        : offsetY
            });

            me.createDragProxy(rect);

            me.fire('dragStart', {
                dragElementRect: rect,
                id             : me.id,
                offsetX        : offsetX,
                offsetY        : offsetY
            });
        });
```

draggable.calendar.WeekEventDragZone can then use it to fire the dragStart event.

## Timeline

- 2021-02-02T12:59:39Z @tobiu added the `enhancement` label
- 2021-02-02T12:59:39Z @tobiu added the `help wanted` label
- 2021-02-02T12:59:39Z @tobiu added the `good first issue` label
### @github-actions - 2024-09-05T02:28:07Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-05T02:28:07Z @github-actions added the `stale` label
### @github-actions - 2024-09-19T02:30:31Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-19T02:30:32Z @github-actions closed this issue

