---
id: 5957
title: 'container.Base: afterSetLayout() => always destroy an old layout'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-09-21T20:18:56Z'
updatedAt: '2024-09-21T20:24:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5957'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-21T20:24:31Z'
---
# container.Base: afterSetLayout() => always destroy an old layout

currently, the `destroy()` call happens inside the `me.rendered` check, which does not cover all edge-cases.

## Timeline

- 2024-09-21T20:18:56Z @tobiu added the `enhancement` label
- 2024-09-21T20:18:57Z @tobiu assigned to @tobiu
- 2024-09-21T20:19:34Z @tobiu referenced in commit `bfd3f87` - "container.Base: afterSetLayout() => always destroy an old layout #5957"
- 2024-09-21T20:19:37Z @tobiu closed this issue
### @tobiu - 2024-09-21T20:23:39Z

ha, forgot one edge case: an old layout could still be a config object, so at this point it would not have a `destroy()` method (and we don't need to adjust things).

- 2024-09-21T20:23:39Z @tobiu reopened this issue
- 2024-09-21T20:24:25Z @tobiu referenced in commit `ab2fe29` - "#5957 container.Base: afterSetLayout() => always destroy an old layout => ignore config based old values"
- 2024-09-21T20:24:31Z @tobiu closed this issue

