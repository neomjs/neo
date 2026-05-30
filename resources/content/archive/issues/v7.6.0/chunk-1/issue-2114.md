---
id: 2114
title: examples/form/field/picker/ displays empty picker
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2021-05-22T20:03:29Z'
updatedAt: '2024-09-16T02:37:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2114'
author: keckeroo
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:37:08Z'
---
# examples/form/field/picker/ displays empty picker

**Describe the bug**
Picker is empty, no console error

![Screen Shot 2021-05-22 at 3 03 14 PM](https://user-images.githubusercontent.com/1653769/119239460-dc9ac980-bb0e-11eb-9cce-7a82eb399056.png)


## Timeline

- 2021-05-22T20:03:29Z @keckeroo added the `bug` label
### @tobiu - 2021-05-22T20:13:04Z

this is correct. a picker is a base class which has no content.

e.g. a date picker extends it (or a select field => adding a list).

you could add something in there for the example itself, if you to.

- 2021-05-22T20:13:19Z @tobiu removed the `bug` label
- 2021-05-22T20:13:19Z @tobiu added the `enhancement` label
### @github-actions - 2024-09-02T02:30:23Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-02T02:30:23Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:37:08Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:37:08Z @github-actions closed this issue

