---
id: 6327
title: 'grid.Row: Create a PoC'
state: OPEN
labels:
  - enhancement
  - no auto close
assignees:
  - tobiu
createdAt: '2025-01-28T18:24:57Z'
updatedAt: '2025-05-14T09:28:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6327'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# grid.Row: Create a PoC

I am just brainstorming about a new concept: should i create a component (class) for grid / table rows

In short: when we change a record, we send the vdom & vnode of the entire view (the mounted / painted part) to the vdom worker, which is quite the overhead.

We could just send the row fraction to the vdom worker, but then still the entire view would be locked for other updates
so updating multiple records would get delayed a lot. component.Base / container.Base has all the logic we need => updating in parallel & parent locking depending on the depth.

However, there needs to be a smart row cycling logic. imagine a grid with 50k rows => we must not even think about creating 50k row component instances. so only instances for painted rows and re-using instances when cycling (scrolling).

I will create a new feature branch for this story. `grid.View` might need to extend `container.Base` in this case.

Inside the current version:
```
store.getAt(0).set({firstname: 'foo'});
store.getAt(1).set({firstname: 'bar'});
```

The first record change would send the view vdom to the vdom worker and lock the view for updates. The second change would wait until the first update cycle is finished. It would most likely still end up inside the same animation frame.

However, in case we update a LOT of records, the impact grows. And, after all, neo is meant for high performance use cases.

@rwaters Thoughts on this one?

## Timeline

- 2025-01-28T18:24:57Z @tobiu added the `enhancement` label
- 2025-01-28T18:24:57Z @tobiu assigned to @tobiu
### @tobiu - 2025-01-29T09:08:42Z

more thoughts on this one:

If i update 50 records in a row, the first record change would trigger a view update. probably all other 49 would end up combined inside the next update cycle. the more changes there are, the faster the current method might be. needs benchmarking though.

- 2025-04-16T12:09:54Z @tobiu cross-referenced by #6658
### @github-actions - 2025-04-30T02:47:44Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-04-30T02:47:44Z @github-actions added the `stale` label
### @github-actions - 2025-05-14T02:51:51Z

This issue was closed because it has been inactive for 14 days since being marked as stale.

- 2025-05-14T02:51:52Z @github-actions closed this issue
- 2025-05-14T09:28:15Z @tobiu removed the `stale` label
- 2025-05-14T09:28:15Z @tobiu added the `no auto close` label
- 2025-05-14T09:28:29Z @tobiu reopened this issue

