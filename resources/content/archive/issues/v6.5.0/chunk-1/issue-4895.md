---
id: 4895
title: 'calendar.view.EditEventContainer: regression bug => using form.Container.getField()'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-12T05:41:05Z'
updatedAt: '2023-09-12T05:46:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4895'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-12T05:46:42Z'
---
# calendar.view.EditEventContainer: regression bug => using form.Container.getField()

when introducing lazy loaded forms, most form methods became async. `getField()` is one of them. we need to `await` the result.

## Timeline

- 2023-09-12T05:41:05Z @tobiu added the `bug` label
- 2023-09-12T05:41:05Z @tobiu assigned to @tobiu
- 2023-09-12T05:46:40Z @tobiu referenced in commit `cc5f937` - "calendar.view.EditEventContainer: regression bug => using form.Container.getField() #4895"
- 2023-09-12T05:46:42Z @tobiu closed this issue
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

