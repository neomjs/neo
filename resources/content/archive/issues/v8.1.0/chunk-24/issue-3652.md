---
id: 3652
title: 'Button Types: Primary, Secondary, Tertiary'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2022-12-20T15:15:16Z'
updatedAt: '2024-09-14T02:26:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3652'
author: mxmrtns
commentsCount: 4
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-14T02:26:32Z'
---
# Button Types: Primary, Secondary, Tertiary

*(No description provided)*

## Timeline

- 2022-12-20T15:15:16Z @mxmrtns added the `enhancement` label
### @Dinkh - 2022-12-28T12:58:15Z

I would like to have the definition as ui.

@example:
```
{
    ntype: 'button',
    ui: 'primary'
}
```

This creates automatically a cls
=> neo-button-primary

- 2023-01-02T20:13:46Z @Dinkh referenced in commit `acd8c9b` - "Adding a way to add 'primary' styles #3652 

This solves the programming part of:
Button Types: Primary, Secondary, Tertiary #3652

Still have to add css classes:

neo-button-primary
neo-button-secondary
neo-button-tertiary"
- 2023-01-02T20:13:57Z @Dinkh cross-referenced by PR #3741
### @Dinkh - 2023-01-02T20:14:48Z

Currently added as Pull-Request the programming part.

Still someone has to add css classes:

neo-button-primary
neo-button-secondary
neo-button-tertiary

- 2023-01-03T09:07:23Z @tobiu referenced in commit `22cdd92` - "Merge pull request #3741 from neomjs/Dinkh-patch-ComponentStyles

Adding a way to add 'primary' styles #3652"
### @github-actions - 2024-08-30T02:27:30Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-30T02:27:31Z @github-actions added the `stale` label
### @github-actions - 2024-09-14T02:26:32Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-14T02:26:32Z @github-actions closed this issue

