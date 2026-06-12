---
id: 4969
title: 'worker.App: webpack magic comments'
state: CLOSED
labels:
  - bug
  - help wanted
  - good first issue
  - stale
assignees:
  - tobiu
createdAt: '2023-10-04T11:09:50Z'
updatedAt: '2024-09-13T02:29:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4969'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:04Z'
---
# worker.App: webpack magic comments

just got the feedback that the build-all process struggles on windows with the current paths.

did some digging:
https://github.com/webpack/webpack/issues/2553#issuecomment-403014383

the recommended way seems still to be: `(?:\/|\\)`

i will give it a try.

## Timeline

- 2023-10-04T11:09:50Z @tobiu added the `bug` label
- 2023-10-04T11:09:50Z @tobiu assigned to @tobiu
- 2023-10-04T11:10:40Z @tobiu referenced in commit `0b4b7a3` - "worker.App: webpack magic comments #4969"
- 2023-10-04T11:10:49Z @tobiu closed this issue
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
- 2023-10-04T14:25:41Z @tobiu reopened this issue
### @tobiu - 2023-10-04T14:26:39Z

just got the feedback, that this change does not fix the windows issue. since i don't have wndows on my machines, i need help :)

- 2023-10-04T14:26:47Z @tobiu added the `help wanted` label
- 2023-10-04T14:26:56Z @tobiu added the `good first issue` label
### @github-actions - 2024-08-29T02:26:39Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:39Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:04Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:04Z @github-actions closed this issue

