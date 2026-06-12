---
id: 4967
title: 'dialog.Base: dragproxy regression issue'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-10-04T09:27:03Z'
updatedAt: '2023-10-04T09:38:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4967'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-04T09:38:43Z'
---
# dialog.Base: dragproxy regression issue

<img width="1785" alt="Screenshot 2023-10-04 at 11 21 19" src="https://github.com/neomjs/neo/assets/1177434/b6389592-25b6-4608-97c1-46901adc6ce0">

the dragproxy was designed to hold the vdom of the owner cmp. working like a fit layout. now with merging the proxy el & the dialog, the styles collide and need to get adjusted. i will take care of it.

in the long run, we can remove the proxy for dragging floating cmps. @ExtAnimal 

## Timeline

- 2023-10-04T09:27:03Z @tobiu added the `bug` label
- 2023-10-04T09:27:03Z @tobiu assigned to @tobiu
- 2023-10-04T09:38:19Z @tobiu referenced in commit `110a924` - "dialog.Base: dragproxy regression issue #4967"
- 2023-10-04T09:38:43Z @tobiu closed this issue
- 2023-10-04T11:16:36Z @tobiu referenced in commit `b2434fb` - "v6.7.6 (#4970)

* main.DomAccess: doc comments, method order

* dialog.Base: showing a dialog with out an animateTargetId breaks #4963

* examples.dialog.DemoDialog: modal state for child dialogs #4964

* #4964 examples.dialog.MainContainer: pass changes of the modal checkbox to the dialog instance

* examples.dialog.MainContainer: animated checkbox #4965

* dialog.Base: close button throws an error, in case there is no animateTargetId #4966

* examples.dialog.DemoDialog: polishing

* covid tables: replacing the deprecated getView() with view

* dialog.Base: dragproxy regression issue #4967

* examples.dialog.DemoDialog: display additional dialogs with a random offset #4968

* worker.App: webpack magic comments #4969

* v6.7.6"

