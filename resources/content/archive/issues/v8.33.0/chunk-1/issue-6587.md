---
id: 6587
title: 'worker.Manager: add controllerchange SW listener as early as possible'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-03-25T10:33:30Z'
updatedAt: '2025-03-25T20:12:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6587'
author: tobiu
commentsCount: 3
parentIssue: 6584
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-03-25T10:56:35Z'
---
# worker.Manager: add controllerchange SW listener as early as possible

Rationale:
1. `main.addon.ServiceWorker` can be too late for a check
2. `main.addon.ServiceWorker` might not even be included, which does not prevent running SW instances from caching
3. MicroLoader => loads Main => imports the `worker.Manager` singleton => feels like a good spot

## Timeline

- 2025-03-25T10:33:30Z @tobiu added the `enhancement` label
- 2025-03-25T10:33:30Z @tobiu assigned to @tobiu
- 2025-03-25T10:33:31Z @tobiu added parent issue #6584
- 2025-03-25T10:51:52Z @tobiu referenced in commit `cd334f0` - "worker.Manager: add controllerchange SW listener as early as possible #6587"
### @tobiu - 2025-03-25T10:56:35Z

@dfabulich not sure, if you are still using your old code:
```
var refreshing;
navigator.serviceWorker.addEventListener('controllerchange',
    function () {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    }
);
```

https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
=> the support for `options.once` was already there in 2017, so i guess we can simplify it to:
```
navigator.serviceWorker.addEventListener('controllerchange', function() {
    window.location.reload()
}, {once: true});
```

- 2025-03-25T10:56:35Z @tobiu closed this issue
### @dfabulich - 2025-03-25T19:49:23Z

Yes, `{once: true}` is the right way to do it now, and I've just updated my blog post to match.

FWIW, `options.once` was not widely available in 2017. I'm not sure it worked at all in pre-Chromium Edge, which means it didn't become newly available until Edge 18 (based on Chromium) in 2018, and didn't reach "widely available" Baseline until 30 months after that, April 2021.

### @tobiu - 2025-03-25T20:12:37Z

@dfabulich Since commits are not easy to track, the idea of what i am doing here:

Abstract base class:
https://github.com/neomjs/neo/blob/dev/src/worker/Base.mjs

This one get used / extended inside apps & examples:
https://github.com/neomjs/neo/blob/dev/apps/ServiceWorker.mjs

Workspaces for devs to create apps via `npx neo-app@latest` follow the exact same structure, so devs can easily override or extend the class as needed (e.g. customising what to cache).

The clue here is that the SW will create a `MessageChannel` and pass the 2nd port through a main-thread to the either dedicated or shared application worker. Combined with remote method access, this allows predictive caching at run-time.

Browser support has luckily evolved a lot during the last years: I still remember too well that in 2018 I had to use a chrome experimental flag to get dedicated workers use JS modules (run without builds). It took more years until the same was in place for `SharedWorker`. Updating the blog post sounds like a good idea. There is still very little to find about SWs online.

Best regards,
Tobi


