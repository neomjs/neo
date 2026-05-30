---
id: 1245
title: 'draggable.DragZone: register main thread configs'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-10-14T10:36:08Z'
updatedAt: '2020-10-14T12:17:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1245'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-10-14T12:17:52Z'
---
# draggable.DragZone: register main thread configs

The current logic is too complicated, especially in case there are multiple drag zones in use.

E.g.:
```
    afterSetScrollContainerId(value, oldValue) {
        if (value) {
            let me    = this,
                owner = me.owner,
                listenerId;

            if (owner.mounted) {
                Neo.main.addon.DragDrop.setScrollContainer({
                    id: value
                });
            } else {
                listenerId = owner.on('mounted', () => {
                    owner.un('mounted', listenerId);
                    me.afterSetScrollContainerId(value, oldValue);
                });
            }
        }
    }
```

This approach forces each drag zone owner to set & reset the related main thread configs on drag:start & end.

Instead, each drag zone should send the relevant main thread configs over onDragStart() and the main thread addon needs to reset them on drag:end.

there should be a method like "getMainThreadConfigs" which child drag (&sort) zone classes can extend.

looking into this now.

## Timeline

- 2020-10-14T10:36:08Z @tobiu added the `enhancement` label
- 2020-10-14T10:36:09Z @tobiu assigned to @tobiu
- 2020-10-14T10:42:13Z @tobiu referenced in commit `abe51b3` - "#1245 draggable.DragZone: getMainThreadConfigs()"
- 2020-10-14T10:44:20Z @tobiu referenced in commit `2f305bf` - "#1245 draggable.DragZone: getMainThreadConfigs() => added alwaysFireDragMove"
- 2020-10-14T10:45:33Z @tobiu referenced in commit `6c8beb4` - "#1245 draggable.DragZone: getMainThreadConfigs() => doc comment"
- 2020-10-14T10:51:03Z @tobiu referenced in commit `f45057b` - "#1245 main.addon.DragDrop: setConfigs() => in progress"
- 2020-10-14T10:54:13Z @tobiu referenced in commit `0725711` - "#1245 draggable.toolbar.DragZone => alwaysFireDragMove: true"
- 2020-10-14T10:58:38Z @tobiu referenced in commit `80a33ae` - "#1245 main.addon.DragDrop: setConfigs() => support for boundaryContainerId"
- 2020-10-14T11:01:02Z @tobiu referenced in commit `7976c0d` - "#1245 draggable.DragZone: boundaryContainerId_ => boundaryContainerId & removed the related logic"
- 2020-10-14T11:03:52Z @tobiu referenced in commit `b76fa70` - "#1245 main.addon.DragDrop: setConfigs() => support for scrollContainerId"
- 2020-10-14T11:06:39Z @tobiu referenced in commit `bed4ea7` - "#1245 draggable.DragZone: scrollContainerId_ => scrollContainerId & adjusted the related logic"
- 2020-10-14T11:08:18Z @tobiu referenced in commit `3866705` - "#1245 main.addon.DragDrop: onDragEnd() => reset alwaysFireDragMove"
- 2020-10-14T11:11:59Z @tobiu referenced in commit `02c9709` - "#1245 draggable.DragZone: scrollFactorLeft_ => scrollFactorLeft (same for top) & adjusted the related logic"
- 2020-10-14T11:18:26Z @tobiu referenced in commit `12a13b0` - "#1245 main.addon.DragDrop: imported DomAccess to use getElementOrBody()"
- 2020-10-14T11:27:22Z @tobiu referenced in commit `fbbc9f0` - "#1245 main.addon.DragDrop: setConfigs() => generic approach"
- 2020-10-14T11:28:41Z @tobiu referenced in commit `304d666` - "#1245 main.addon.DragDrop: setConfigs() => added scrollFactorLeft & top to the doc comment"
- 2020-10-14T12:17:52Z @tobiu closed this issue

