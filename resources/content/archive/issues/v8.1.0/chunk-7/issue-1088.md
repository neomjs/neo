---
id: 1088
title: React Component Wrapper to use neo.mjs inside React Apps
state: CLOSED
labels:
  - enhancement
  - help wanted
  - discussion
  - stale
assignees: []
createdAt: '2020-08-17T08:53:19Z'
updatedAt: '2024-09-27T02:34:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1088'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-27T02:34:30Z'
---
# React Component Wrapper to use neo.mjs inside React Apps

This topic came up recently.

In general, I am not sure if this is a good idea. You will lose big parts of the idle main thread advantage.

In case there is a high demand for it, I can do it (or you could create it on your own).

Strategy:
Creating a Wrapper Component itself for React is fairly easy.
There has to be a check, if "Neo" exists as a global main thread (window) variable.

If not (only once!), dynamically include the main thread, which will then automatically create the workers setup.

Once the Wrapper gets mounted, we need the dom node id and a new main thread addon, to let the App Worker know that we want to create a new Component. We can mount it into the given parentId.

The App worker needs logic to consume the requests from the new main thread addon.

Once the state / config of our neo wrapper component changes, we need to delegate these changes to the App Worker as well. Keep in mind, that all neo.mjs based components live within the App Worker Scope, so there is no direct access.

Something like:
```
Neo.Main.addon.ExternalApi.changeConfig({
    id   : 'myCalendarId',
    path : 'weekComponent.timeaxis',
    name : 'dayNameFormat',
    value: 'short'
});
```

We can use Neo.getComponent() inside the App Worker to get the instance.
In case we want to access nested Components, we can pass a path.
We can use Neo.ns() to map it on the Component top level scope.

One thing to discuss: if the Component does get removed from the React Template, should it always get destroyed?
I assume this happens for all React based Components, but in Neo we can either just unmount them (keep the JS instance => in case we want to show it again) or trigger a real destroy() call.

As mentioned, not a high prio item for me.

## Timeline

- 2020-08-17T08:53:19Z @tobiu added the `enhancement` label
- 2020-08-17T08:53:19Z @tobiu added the `help wanted` label
- 2020-08-17T08:53:19Z @tobiu added the `discussion` label
### @github-actions - 2024-09-13T02:31:17Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-13T02:31:18Z @github-actions added the `stale` label
### @github-actions - 2024-09-27T02:34:29Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-27T02:34:30Z @github-actions closed this issue

