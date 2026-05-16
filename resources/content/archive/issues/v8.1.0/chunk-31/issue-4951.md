---
id: 4951
title: 'main.DomAccess: getBoundingClientRect() does not pass minHeight & minWidth to the app worker'
state: CLOSED
labels:
  - bug
  - stale
assignees:
  - tobiu
createdAt: '2023-09-27T18:35:23Z'
updatedAt: '2024-09-13T02:29:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4951'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:07Z'
---
# main.DomAccess: getBoundingClientRect() does not pass minHeight & minWidth to the app worker

related to: https://github.com/neomjs/neo/issues/4950

while we can not use `JSON.stringify()` for `DOMRect`s, the output will not include custom class field values.

however, we can modify what we get back on class level.

@ExtAnimal 

## Timeline

- 2023-09-27T18:35:23Z @tobiu added the `bug` label
- 2023-09-27T18:35:24Z @tobiu assigned to @tobiu
- 2023-09-27T19:23:33Z @tobiu referenced in commit `c22ec67` - "main.DomAccess: getBoundingClientRect() does not pass minHeight & minWidth to the app worker #4951"
### @tobiu - 2023-09-27T19:30:03Z

the json conversion works (had to add new class fields for it):
<img width="847" alt="Screenshot 2023-09-27 at 21 24 33" src="https://github.com/neomjs/neo/assets/1177434/1ab244a4-ee60-4798-b655-32764e2f0ddc">

we should keep this change.

however, there is a lot more to it. in case we are creating a worker message, we now get the 2 missing values while creating it:
<img width="838" alt="Screenshot 2023-09-27 at 21 21 07" src="https://github.com/neomjs/neo/assets/1177434/a76d841a-364b-48aa-992c-bd13c349dbe2">

but, the result inside the app worker will convert the result back into `DOMRect` instances (native code), in which case we lose the custom fields right away:
<img width="812" alt="Screenshot 2023-09-27 at 21 21 31" src="https://github.com/neomjs/neo/assets/1177434/89ed7314-5c7f-4ef7-bcf2-8e0585a5ed89">

not sure, if we can even manipulate this part. might(!) be possible.

testing it in firefox => messages containing `DOMRects` feel slow.

@ExtAnimal: before doing a final change, we should sync on this ticket. my current recommendation is that `getBoundingClientRect()` inside `main.DomAccess` should just return a plain object (we can use the new toJSON() method for it) and other non-remote methods could convert it to Rectangle instances.

- 2023-09-28T10:55:14Z @tobiu referenced in commit `d91c921` - "v6.7.3 (#4954)

* component.Base: getDomRect() => inconsistent return values #4950

* main.DomAccess: getBoundingClientRect() does not pass minHeight & minWidth to the app worker #4951

* main.DomAccess: getBoundingClientRect() minor cleanup

* draggable.toolbar.SortZone: switchItems() => regression issue #4948

* main.DomAccess: -testing log

* table.Container: get headerToolbar(), get view() convenience shortcuts #4952

* form.field.Text: emptyValue config #4953

* v6.7.3"
### @github-actions - 2024-08-29T02:26:41Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:41Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:07Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:07Z @github-actions closed this issue

