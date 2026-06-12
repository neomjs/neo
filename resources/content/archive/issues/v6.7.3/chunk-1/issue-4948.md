---
id: 4948
title: 'draggable.toolbar.SortZone: switchItems() => regression issue'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-27T16:58:50Z'
updatedAt: '2023-09-27T19:36:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4948'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-27T19:36:32Z'
---
# draggable.toolbar.SortZone: switchItems() => regression issue

the change inside `component.Base: getDomRect()` which is now returning a `util.Rectangle` instance, introduced a new bug, since DOMRects are not spreadable.

will look into it now (we do have clone())

@ExtAnimal 

blocking https://github.com/neomjs/neo/issues/4767

## Timeline

- 2023-09-27T16:58:50Z @tobiu added the `bug` label
- 2023-09-27T16:58:51Z @tobiu assigned to @tobiu
- 2023-09-27T17:20:27Z @tobiu changed title from **draggable.toolbar.DragZone: switchItems() => regression issue** to **draggable.toolbar.SortZone: switchItems() => regression issue**
- 2023-09-27T19:35:37Z @tobiu referenced in commit `aae132f` - "draggable.toolbar.SortZone: switchItems() => regression issue #4948"
### @tobiu - 2023-09-27T19:36:33Z

DOMRect instances are leaving `left` & `top` as readOnly, so i switched to `x` and `y`.

- 2023-09-27T19:36:33Z @tobiu closed this issue
- 2023-09-28T10:55:14Z @tobiu referenced in commit `d91c921` - "v6.7.3 (#4954)

* component.Base: getDomRect() => inconsistent return values #4950

* main.DomAccess: getBoundingClientRect() does not pass minHeight & minWidth to the app worker #4951

* main.DomAccess: getBoundingClientRect() minor cleanup

* draggable.toolbar.SortZone: switchItems() => regression issue #4948

* main.DomAccess: -testing log

* table.Container: get headerToolbar(), get view() convenience shortcuts #4952

* form.field.Text: emptyValue config #4953

* v6.7.3"

