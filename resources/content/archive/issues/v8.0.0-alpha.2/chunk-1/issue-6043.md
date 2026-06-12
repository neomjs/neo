---
id: 6043
title: Appworker based Delta Updates
state: CLOSED
labels:
  - enhancement
  - epic
  - developer-experience
assignees:
  - tobiu
createdAt: '2024-10-27T22:18:58Z'
updatedAt: '2024-11-11T08:59:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6043'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-11-11T08:59:56Z'
---
# Appworker based Delta Updates

This one is a huge epic.

I will work on it inside a separate feature branch, until it gets stable. Draft PR to track the progress:
https://github.com/neomjs/neo/pull/6042

The goal is to keep the rendering logic inside the vdom worker, but move the delta updates logic inside the app worker.

**In depth:**
When updates happen within the vdom worker, we send the `vdom` & `vnode` trees over. before we are getting the new vnode back, no updates must happen, since this corrupts the state (wrong deltas). While it is manageable for components itself, it becomes extremely complex since no updates can happen, in case any parent is already updating.

Since we want sub-component updates soon, updates can also not happen, in case any child vdom tree is updating. The bookkeeping logic would get as expensive as the parsing for updates itself.

So, the goal is to change the operation to generate the new vnode into a `sync` OP, in which case we no longer need the bookkeeping at all. Applying the deltas within the main thread (browser window) will of course still be `async`.

## Timeline

- 2024-10-27T22:18:58Z @tobiu added the `developer-experience` label
- 2024-10-27T22:18:58Z @tobiu added the `enhancement` label
- 2024-10-27T22:18:58Z @tobiu added the `epic` label
- 2024-10-27T22:18:58Z @tobiu assigned to @tobiu
- 2024-10-27T22:20:05Z @tobiu referenced in commit `cae4ccc` - "#6043 removing the old vdom.Helper, importing the new singletons into the app & vdom worker, component.Base: using the new rendering remote method"
- 2024-10-27T22:32:37Z @tobiu referenced in commit `f22ed99` - "#6043 component.Base: executeVdomUpdate() => using the new UpdateHelper & simplifying the logic"
- 2024-10-27T22:39:19Z @tobiu referenced in commit `448b82b` - "#6043 removed the useVdomWorker framework config"
- 2024-10-27T22:53:52Z @tobiu referenced in commit `c16e418` - "#6043 component.Base: removed the isVdomUpdating config"
- 2024-10-27T22:55:10Z @tobiu referenced in commit `dddd2b7` - "#6043 component.Base: removed isParentVdomUpdating()"
- 2024-10-27T23:03:18Z @tobiu referenced in commit `24ba7c9` - "#6043 component.Base: removed needsParentUpdate()"
- 2024-10-27T23:27:29Z @tobiu referenced in commit `db3e191` - "#6043 component.Base: removed childUpdateCache"
### @tobiu - 2024-11-11T08:59:56Z

While this happens very rarely, I am going to hold off on this one. @rwaters 

I missed the point, that in case we are running vdom OPs inside the app & vdom worker, vnode ids will no longer be unique (due to 2 separate id generators).

My first thought that this could be easily resolved with using a SAB:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer

=> Storing the dynamic vnode id counter inside of it so that both workers have direct access to the shared counter for creating ids.

However, SABs are now strictly limited to cross origin isolation:
https://web.dev/articles/cross-origin-isolation-guide

In case it is not enabled (e.g. inside the webpack dev server or the Webstorm dev server), the SAB ctor is simply undefined.

I do get the point, that worker files (scripts) need to share the same origin, but enforcing entire apps to do it goes too far.

While it often is a good thing to go for COI, enforcing it for all future neo apps goes is not reasonable.

With the v8 release, we will get scoped vdom updates which can drastically reduce the footprints of search trees and worker messages. While we could move the entire vdom engine into the app worker, having the buffering to get less tree parsing is also something we do not want to lose.

- 2024-11-11T08:59:56Z @tobiu closed this issue
- 2024-11-11T09:00:29Z @tobiu cross-referenced by PR #6042

