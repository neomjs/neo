---
id: 3846
title: 'data.RecordFactory: field calculate & convert not reflecting updates'
state: CLOSED
labels:
  - bug
  - stale
assignees: []
createdAt: '2023-01-12T09:14:26Z'
updatedAt: '2024-09-14T02:26:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3846'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:11Z'
---
# data.RecordFactory: field calculate & convert not reflecting updates

@Dinkh @maxrahder

in general we should discuss if we really need both: `calculate` and `convert`. i personally think that just one of them is sufficient, since both are based on functions (e.g. fat arrows).

the important point about this ticket:
if we generate a new field like
```
{
    name: 'fullname',
    convert: data => `${data.firstname} ${data.lastname}`
}
```

the field needs to update in case any of the used fields inside the convert / calculate fn body get changed at run time. this is very similar to the way `model.Component` based bindings work.

## Timeline

- 2023-01-12T09:14:26Z @tobiu added the `bug` label
### @github-actions - 2024-08-30T02:27:12Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:12Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:11Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:11Z @github-actions closed this issue

