---
id: 4654
title: Creating a Router for neo
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2023-08-06T12:09:54Z'
updatedAt: '2023-10-30T09:46:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4654'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-30T09:46:45Z'
---
# Creating a Router for neo

Let me explain the current logic first.
`main.DomEvents` will forward hash-change events to the app worker:
https://github.com/neomjs/neo/blob/dev/src/main/DomEvents.mjs#L497

`worker.App` will push the new values into `util.HashHistory`:
https://github.com/neomjs/neo/blob/dev/src/worker/App.mjs#L277

This Singleton will store the last x hash values inside a stack:
https://github.com/neomjs/neo/blob/dev/src/util/HashHistory.mjs

Now every controller (including view controllers) will subscribe to the HashHistory change event:
https://github.com/neomjs/neo/blob/dev/src/controller/Base.mjs

As a result, developers need to override `onHashChange()` inside their controllers and act accordingly to modify their views as needed. This can be cumbersome.

It would be nice, if `controller.Base` would provide a `routes_` config, where you can directly specify handlers. This should include variables (could be wrapped inside {}), so we need a bit of regex parsing.

Example how it could be:
```
routes: {
    '/home'                         : 'handleHomeRoute',
    '/users/{userId}'               : 'handleUserRoute',
    '/users/{userId}/posts/{postId}': 'handlePostRoute',
    'default'                       : 'handleOtherRoutes'
}
```

The route callback handlers should receive params for the new & old route, as well as used ids inside the route definitions.

Since `controller.Base` does nothing else except for working with hash related changes, I would drop the logic in there. An alternative would be to extend the class => `controller.Router`. In this case `controller.Component` (view controller) would need to extend the router.

## Timeline

- 2023-08-06T12:09:54Z @tobiu added the `enhancement` label
### @tobiu - 2023-08-16T18:46:32Z

The router should be capable of handling private routes (only available when being logged in) otherwise redirect to login.

We could also add role based routes, in case we do want to make it more generic.

- 2023-10-17T06:29:57Z @ThorstenRaab cross-referenced by PR #5023
- 2023-10-30T09:46:46Z @tobiu closed this issue

