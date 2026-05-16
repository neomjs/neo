---
id: 5113
title: enhance the convertDesignTokens program
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2023-11-29T12:03:04Z'
updatedAt: '2024-09-12T02:29:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5113'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:06Z'
---
# enhance the convertDesignTokens program

@mxmrtns since we are now including extensions, the logic will become more complex.

Example: 
<img width="585" alt="Screenshot 2023-11-29 at 12 58 04" src="https://github.com/neomjs/neo/assets/1177434/356d22bd-48ed-43ef-965e-bf6779aaf121">

inside the semanic tokens, we reference to a core token value.

Now if we want to use SCSS based functions like:
lighten(myColor, 10%)

We can not use CSS variables as input (SCSS is not aware of their values).

To do it right, we need to parse all token files first and create a JS map of keys (namespaces) and values. This also needs to honor direct extensions of values.

Once we have the map in place, we can then parse each file on its own and in case a value references another token and has an extension (lighten(), darken(), etc.), then we can replace the token value with the plain value from the map.

Tokens without an extension can still get mapped directly to CSS variables.

## Timeline

- 2023-11-29T12:03:04Z @tobiu added the `enhancement` label
- 2023-11-29T12:03:04Z @tobiu assigned to @tobiu
### @github-actions - 2024-08-29T02:26:16Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:26:16Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:05Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:06Z @github-actions closed this issue

