---
id: 4950
title: 'component.Base: getDomRect() => inconsistent return values'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-27T18:19:50Z'
updatedAt: '2023-09-27T18:20:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4950'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-27T18:20:36Z'
---
# component.Base: getDomRect() => inconsistent return values

actually i was not aware that we can now convert `DOMRect`s into JSON. even both ways => we do get them back inside the app worker.

`getDomRect()` inside the app worker now returns `DOMRect` instances for arrays of ids and `util.Rectangle` instances for non-arrays.

i think we can simplify the logic quite a bit.

will give it a shot, but could use a review @ExtAnimal.

## Timeline

- 2023-09-27T18:19:50Z @tobiu added the `bug` label
- 2023-09-27T18:19:51Z @tobiu assigned to @tobiu
- 2023-09-27T18:20:35Z @tobiu referenced in commit `846533c` - "component.Base: getDomRect() => inconsistent return values #4950"
- 2023-09-27T18:20:36Z @tobiu closed this issue
- 2023-09-27T18:35:24Z @tobiu cross-referenced by #4951
- 2023-09-28T10:55:14Z @tobiu referenced in commit `d91c921` - "v6.7.3 (#4954)

* component.Base: getDomRect() => inconsistent return values #4950

* main.DomAccess: getBoundingClientRect() does not pass minHeight & minWidth to the app worker #4951

* main.DomAccess: getBoundingClientRect() minor cleanup

* draggable.toolbar.SortZone: switchItems() => regression issue #4948

* main.DomAccess: -testing log

* table.Container: get headerToolbar(), get view() convenience shortcuts #4952

* form.field.Text: emptyValue config #4953

* v6.7.3"
- 2023-10-02T09:34:52Z @tobiu cross-referenced by #4892

