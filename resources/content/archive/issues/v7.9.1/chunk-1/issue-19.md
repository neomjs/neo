---
id: 19
title: 'Discussion: Nodejs & GraphQL based middleware'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - epic
  - stale
assignees: []
createdAt: '2019-11-17T16:28:18Z'
updatedAt: '2024-09-29T02:39:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/19'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-29T02:39:18Z'
---
# Discussion: Nodejs & GraphQL based middleware

Max (elmasse) brought up this topic:

We could set up a separate repository to create a neo.mjs middleware using nodejs & GraphQL.

Take a look at:
https://graphql.org/graphql-js/

https://medium.com/codingthesmartway-com-blog/creating-a-graphql-server-with-node-js-and-express-f6dddc5320e1

This is an epic and probably involves a lot of work.

In short: neo.mjs  should have a socket connection to the node server, probably using a custom API. 

Schemas defined in the middleware could optionally automatically create models on the client side as well as the other way around. Changes to the data of a middleware schema should automatically update the store data of a bound client-side store as well as the other way around.

Would help for testing buffering of remotely loaded grids & tables.

I could definitely use feedback on this one!

## Timeline

- 2019-11-17T16:28:18Z @tobiu added the `enhancement` label
- 2019-11-17T16:28:18Z @tobiu added the `help wanted` label
- 2019-11-17T16:28:18Z @tobiu added the `epic` label
### @github-actions - 2024-09-15T02:37:31Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-15T02:37:31Z @github-actions added the `stale` label
### @github-actions - 2024-09-29T02:39:17Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-29T02:39:18Z @github-actions closed this issue

