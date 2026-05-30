---
id: 5135
title: main.addon.Navigator
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - ExtAnimal
createdAt: '2023-12-05T10:43:42Z'
updatedAt: '2024-09-12T02:28:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5135'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:28:58Z'
---
# main.addon.Navigator

related to: https://github.com/neomjs/neo/pull/5123

The idea of the Navigator is a separation of selections from keyboard navigation, which should just move the focus state. A selection could happen when using the `Enter` or `Space` keys explicitly.

To not overload `main.DomAccess`, e.g. a new main thread addon would make sense (separation of concerns).

One important note:
neo.mjs relies on a strict separation of the view layer from the DOM. Components can get mounted / unmounted multiple times during their life-cycles. E.g. we could move an existing `form.field.Select` from one browser window to another one, in which case there is no way to re-use DOM.

Other use-cases are card layouts, which remove all inactive cards from the DOM by default (keeping the JS based instances though).

=> The Navigator has to be coupled to `afterSetMounted()`.

## Timeline

- 2023-12-05T10:43:42Z @tobiu added the `enhancement` label
- 2023-12-05T10:43:42Z @tobiu assigned to @ExtAnimal
- 2023-12-05T10:50:59Z @tobiu cross-referenced by #5136
- 2023-12-05T11:17:37Z @tobiu cross-referenced by #5139
### @github-actions - 2024-08-29T02:26:10Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:10Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:28:58Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:28:58Z @github-actions closed this issue

