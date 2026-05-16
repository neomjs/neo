---
id: 5602
title: 'model.Component: Improve support for using data records inside VM data properties & binding into record fields '
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2024-07-22T07:01:22Z'
updatedAt: '2024-11-04T02:37:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5602'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-04T02:37:54Z'
---
# model.Component: Improve support for using data records inside VM data properties & binding into record fields 

VMs have a safeguard to not change the internal structure of records:
https://github.com/neomjs/neo/blob/dev/src/model/Component.mjs#L518

Normally, each object property would get replaced with setters to get change events, but this could easily break the internal logic of records, which is also get & set driven.

if we wanted to bind to specific record fields, we would need to extend the logic a bit:
e.g. somewhere here: https://github.com/neomjs/neo/blob/dev/src/data/RecordFactory.mjs#L329

records do fire change events on their store, but we would need a notification for a given VM which then could trigger `onDataPropertyChange()`.

## Timeline

- 2024-07-22T07:01:22Z @tobiu added the `enhancement` label
### @github-actions - 2024-10-21T02:36:53Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-10-21T02:36:54Z @github-actions added the `stale` label
### @github-actions - 2024-11-04T02:37:53Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-11-04T02:37:54Z @github-actions closed this issue

