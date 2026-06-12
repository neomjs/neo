---
id: 4893
title: 'form.Container: adjustTreeLeaves() => sharper separation of the key & value realms'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-11T21:03:17Z'
updatedAt: '2023-09-12T13:29:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4893'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-12T13:29:19Z'
---
# form.Container: adjustTreeLeaves() => sharper separation of the key & value realms

when using a deeply nested form field names structure including objects & arrays, we need a smart way to check when we are leaving field paths and getting into the value realm.

the current version will break for checkbox groups, containing an array of items.

we should check for objects & arrays if a path matches a form field (then entering the value realm) or if it is not (staying inside the key realm).

i will dive into this tomorrow.

## Timeline

- 2023-09-11T21:03:17Z @tobiu added the `bug` label
- 2023-09-11T21:03:17Z @tobiu assigned to @tobiu
- 2023-09-12T06:12:31Z @tobiu referenced in commit `19bd2f8` - "#4893 form.Container: adjustTreeLeaves() => passing all field paths to the method"
- 2023-09-12T13:26:23Z @tobiu referenced in commit `6200d85` - "form.Container: adjustTreeLeaves() => sharper separation of the key & value realms #4893"
- 2023-09-12T13:27:19Z @tobiu referenced in commit `41db2d6` - "#4893 removed a testing log"
- 2023-09-12T13:29:19Z @tobiu closed this issue
- 2023-09-12T13:37:23Z @tobiu referenced in commit `c76eccb` - "v6.5.0 (#4898)

* main.DomAccess: minor cleanup

* calendar.view.EditEventContainer: regression bug => using form.Container.getField() #4895

* calendar.view.EditEventContainer: onFocusLeave() cleanup

* #4893 form.Container: adjustTreeLeaves() => passing all field paths to the method

* docs build throws a JS error #4896

* Fix fallback aligning, clipping and moving on resize-caused move (#4894)

* Fix fallback aligning, clipping and moving on resize-caused move

* Fix

* form.Container: adjustTreeLeaves() => sharper separation of the key & value realms #4893

* #4893 removed a testing log

* component.Base: not registering needed updates to parents before a vnode is there => mounted true #4897

* v6.5.0

---------

Co-authored-by: Nige White <nige.animal@gmail.com>"

