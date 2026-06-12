---
id: 4530
title: Columns should support flex
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-07-10T11:51:13Z'
updatedAt: '2024-09-13T02:29:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4530'
author: Dinkh
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-13T02:29:46Z'
---
# Columns should support flex

Currently columns only work with width. When using `flex`, either the header or the row does not reflect this.

```
columns: [{
    dataField: 'timestamp',
    flex         : 1,
    text        : 'TIME'
}]
```

## Timeline

- 2023-07-10T11:51:13Z @Dinkh added the `enhancement` label
### @tobiu - 2023-07-10T12:10:09Z

hi torsten,

`flex` is already in there:
https://github.com/neomjs/neo/blob/dev/src/table/View.mjs#L154

keep in mind that this implementation is not a real grid, but a table, so our options to flex are a bit limited.

in case you do have ideas how to improve the current behavior, please drop them in here, otherwise we can probably close the ticket.

i am mostly using something like `width: '25%'` to manually create the sizes in a way i need them.

### @github-actions - 2024-08-29T02:27:09Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:10Z @github-actions added the `stale` label
### @github-actions - 2024-09-13T02:29:45Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-13T02:29:46Z @github-actions closed this issue

