---
id: 4062
title: button.Menu
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2023-02-15T15:42:51Z'
updatedAt: '2024-09-12T02:29:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4062'
author: MRHajari
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-12T02:29:33Z'
---
# button.Menu

I need this button.Menu, which can be seen in the image.

<img width="396" alt="Bildschirm­foto 2023-02-15 um 15 13 04" src="https://user-images.githubusercontent.com/86204452/219075883-abc671ff-9b6e-4f59-abc3-0c65ed4bdb6f.png">


## Timeline

- 2023-02-15T15:42:51Z @MRHajari added the `enhancement` label
- 2023-02-15T15:44:39Z @tobiu cross-referenced by #1132
### @tobiu - 2023-02-15T15:47:55Z

we already have the base class:
https://github.com/neomjs/neo/blob/dev/src/button/Menu.mjs

and we actually have 2 different menu implementations:
https://github.com/neomjs/neo/blob/dev/src/menu/List.mjs
https://github.com/neomjs/neo/blob/dev/src/menu/Panel.mjs

so we need to "just" connect them.

menu online demo:
https://neomjs.github.io/pages/node_modules/neo.mjs/examples/menu/panel/

<img width="421" alt="Screenshot 2023-02-15 at 16 47 31" src="https://user-images.githubusercontent.com/1177434/219078480-d2b82044-c2d9-4ae3-b4db-aa0a56f14a15.png">

keyNav is already in there.

### @github-actions - 2024-08-29T02:27:35Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-08-29T02:27:35Z @github-actions added the `stale` label
### @github-actions - 2024-09-12T02:29:32Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-12T02:29:33Z @github-actions closed this issue

