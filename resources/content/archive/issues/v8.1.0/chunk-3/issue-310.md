---
id: 310
title: 'core.Base: instance config oder'
state: CLOSED
labels:
  - enhancement
  - stale
assignees: []
createdAt: '2020-03-18T08:44:31Z'
updatedAt: '2024-09-28T02:32:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/310'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-28T02:32:06Z'
---
# core.Base: instance config oder

pondering ticket.

after removing the afterSetQueue based logic, the instance configs get applied by dependency.

this makes it harder to read instances logged into the dev tools console.

we could try sorting the keys manually onConstructed (className, ntype, chronological).

**IMPORTANT**: this is only meant to happen in dev mode, not for the dist versions

## Timeline

- 2020-03-18T08:44:31Z @tobiu added the `enhancement` label
### @tobiu - 2020-03-18T10:24:24Z

something like this might work, but instead of returning a copy modifying the real object (this).
we should also honor non enumerable objects, symbols(?).

```
function sortObject(obj) {
  return Object.keys(obj)
    .sort().reduce((a, v) => {
    a[v] = obj[v];
    return a; }, {});
}
```

### @github-actions - 2024-09-14T02:27:51Z

This issue is stale because it has been open for 90 days with no activity.

- 2024-09-14T02:27:51Z @github-actions added the `stale` label
### @github-actions - 2024-09-28T02:32:05Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2024-09-28T02:32:06Z @github-actions closed this issue

