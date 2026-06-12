---
id: 1076
title: main.draggable.sensor.Touch
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-15T10:49:38Z'
updatedAt: '2020-08-20T15:57:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1076'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-20T15:57:58Z'
---
# main.draggable.sensor.Touch

similar to the main.draggable.sensor.Mouse implementation.

using the same custom events (drag:start, drag:move, drag:end), just mapping touch* base events

## Timeline

- 2020-08-15T10:49:38Z @tobiu added the `enhancement` label
- 2020-08-15T10:49:39Z @tobiu assigned to @tobiu
- 2020-08-18T13:58:41Z @tobiu referenced in commit `c038b18` - "main.draggable.sensor.Touch #1076 base class"
- 2020-08-18T14:04:50Z @tobiu referenced in commit `1ce3da0` - "#1076 main.draggable.sensor.Touch: ctor"
- 2020-08-18T14:09:31Z @tobiu referenced in commit `29b1436` - "#1076 main.draggable.sensor.Touch: basic method setup"
- 2020-08-18T14:24:43Z @tobiu referenced in commit `e4d8446` - "#1076 main.draggable.sensor.Touch: onTouchStart() logic"
- 2020-08-18T14:31:11Z @tobiu referenced in commit `b073f46` - "#1076 main.DomEvents: getTouchCoords()"
- 2020-08-18T14:37:48Z @tobiu referenced in commit `0eecb65` - "#1076 main.draggable.sensor.Touch: using getTouchCoords()"
- 2020-08-18T14:40:39Z @tobiu referenced in commit `57d67ca` - "#1076 main.draggable.sensor.Touch: tapTimeout config, window.setTimeout => setTimeout"
- 2020-08-18T14:51:57Z @tobiu referenced in commit `5bf97d0` - "#1076 main.draggable.sensor.Touch: onDistanceChange() logic"
- 2020-08-18T15:02:23Z @tobiu referenced in commit `8714086` - "#1076 main.draggable.sensor.Touch: polishing"
- 2020-08-18T15:08:57Z @tobiu referenced in commit `271b37a` - "#1076 main.draggable.sensor.Touch: startDrag() logic"
- 2020-08-18T15:12:53Z @tobiu referenced in commit `1855476` - "#1076 main.draggable.sensor.Touch: onTouchMove() logic"
- 2020-08-18T15:24:38Z @tobiu referenced in commit `0fb3597` - "#1076 main.draggable.sensor.Touch: onTouchEnd() logic, replaced preventDefault() with stopEvent()"
- 2020-08-18T16:07:57Z @tobiu referenced in commit `6c20978` - "#1076 main.draggable.sensor.Touch: polishing & testing"
- 2020-08-20T15:57:58Z @tobiu closed this issue

