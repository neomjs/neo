---
id: 781
title: Moving Apps out of the main repo
state: CLOSED
labels:
  - enhancement
  - help wanted
  - epic
  - discussion
  - stale
assignees: []
createdAt: '2020-06-27T09:01:20Z'
updatedAt: '2024-09-28T02:31:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/781'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:31:37Z'
---
# Moving Apps out of the main repo

The goal was to create demo apps inside the main repo, since it is pretty convenient to change & extend the framework code-base at the same time. Especially with the current npm publish timeout issues.

The Apps which are "finished" already got their own repos using neo.mjs as a node module.

The only reason they are still inside this repo as well is, that the current online examples just display the apps & examples within the neo repo.

We need to check if the pages repo can add dependencies for app repos, while keeping the internal structure.

This will most likely need to add multiple versions of the neo framework. We could probably use different framework versions for different apps (not a goal).

```
pages
- node_modules
- - covid-helix
- - - node_modules
- - - -neo.mjs
- - - node_modules
- - neo.mjs
- - - apps
- - - - covid-gallery
```

Thoughts?

## Timeline

- 2020-06-27T09:01:20Z @tobiu added the `enhancement` label
- 2020-06-27T09:01:20Z @tobiu added the `help wanted` label
- 2020-06-27T09:01:20Z @tobiu added the `epic` label
- 2020-06-27T09:01:20Z @tobiu added the `discussion` label
### @github-actions - 2024-09-14T02:27:26Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:27:27Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:31:37Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:31:37Z @github-actions closed this issue

