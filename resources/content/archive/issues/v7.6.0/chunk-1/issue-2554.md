---
id: 2554
title: Creating a neo.mjs demo for krausest / js-framework-benchmark
state: CLOSED
labels:
  - enhancement
  - stale
assignees:
  - tobiu
createdAt: '2021-07-01T13:07:03Z'
updatedAt: '2024-09-16T02:36:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2554'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-16T02:36:49Z'
---
# Creating a neo.mjs demo for krausest / js-framework-benchmark

@krausest Hi Stefan, tagging you here to keep you in the loop.

The requirements to create a demo app are a bit painful for neo, similar to the real world app.
We have to use bootstrap as well as an exactly defined dom markup.

This means: we can not use high level components like `Neo.table.Container`, but need to stick to `Neo.component.Base`.

I started the development inside a fork:
https://github.com/neomjs/js-framework-benchmark/tree/master/frameworks/keyed/neomjs/apps/neoapp

but am now moving it into the main neo repo, to faster work on the app and framework in parallel.

For a "real" table comparison, I would definitely go for buffered rendering (not possible here).

The demo is also missing mass table cell updates, which is a point where the vdom engine really shines.

E.g.: https://github.com/neomjs/neo/tree/dev/examples/tablePerformance

This would be a nice addition to the requirements.

## Timeline

- 2021-07-01T13:07:03Z @tobiu added the `enhancement` label
- 2021-07-01T13:07:03Z @tobiu assigned to @tobiu
- 2021-07-01T13:17:01Z @tobiu referenced in commit `010f338` - "#2554 updated the content to match the current state of the fork version. bootstrap styles included from the cdn."
- 2021-07-01T13:18:12Z @tobiu referenced in commit `39c52b6` - "#2554 readme file"
- 2021-07-01T13:18:55Z @tobiu referenced in commit `acdcdb8` - "#2554 index file formatting"
### @github-actions - 2024-09-01T02:38:30Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-01T02:38:30Z @github-actions added the `stale` label
### @github-actions - 2024-09-16T02:36:48Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-16T02:36:49Z @github-actions closed this issue

