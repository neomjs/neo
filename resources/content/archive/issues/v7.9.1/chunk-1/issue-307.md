---
id: 307
title: 'component.Button: one combined dom listener'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2020-03-17T20:29:59Z'
updatedAt: '2024-09-28T02:32:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/307'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:32:07Z'
---
# component.Button: one combined dom listener

pondering ticket.

right now, in case a handler config is set, one domListener => click will get added.

in case a route config is set, the same happens.

this is not too bad, since both use the global click listener on the document.body, but it does add another entry into manager.DomEvents (App worker).

To resolve this, a button should always add one (and only one) click listener, which points to a new method (e.g. onClick).

onClick needs to execute the route & handler, in case they exist.

the tricky part is, that controller.Component needs to get adjusted to parse and store the new handlerFn (since it is no longer related to the domEvent logic).

also, all existing code (examples, apps) needs to get checked and should replace all domListeners => click code with a handler.

## Timeline

- 2020-03-17T20:29:59Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-14T02:27:52Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:27:52Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:32:07Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:32:07Z @github-actions closed this issue

