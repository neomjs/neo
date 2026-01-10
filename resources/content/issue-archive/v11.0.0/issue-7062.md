---
id: 7062
title: 'functional.component.Base: enhance the `destroy()` signature'
state: CLOSED
labels:
  - enhancement
  - help wanted
  - good first issue
  - hacktoberfest
assignees:
  - ad1tyayadav
createdAt: '2025-07-15T17:42:05Z'
updatedAt: '2025-10-27T10:45:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7062'
author: tobiu
commentsCount: 3
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-27T10:45:02Z'
---
# functional.component.Base: enhance the `destroy()` signature

* `compnent.Base` uses params to prevent children from triggering update() call when getting destroyed.
* Consistency.
* More importantly preventing not needed calls to the vdom worker.

## Timeline

- 2025-07-15 @tobiu assigned to @tobiu
- 2025-07-15 @tobiu added the `enhancement` label
- 2025-07-15 @tobiu added parent issue #6992
### @github-actions - 2025-10-14 02:41

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-14 @github-actions added the `stale` label
- 2025-10-14 @tobiu removed the `stale` label
- 2025-10-14 @tobiu added the `help wanted` label
- 2025-10-14 @tobiu added the `good first issue` label
- 2025-10-14 @tobiu added the `hacktoberfest` label
### @ad1tyayadav - 2025-10-26 13:23

assign me


### @tobiu - 2025-10-26 13:27

Thanks for your interest. For this one I recommend to look into:
https://github.com/neomjs/neo/blob/dev/src/component/Base.mjs#L1144
https://github.com/neomjs/neo/blob/dev/src/container/Base.mjs#L476

I would also recommend the "AI Native" workflows and let agents figure out the details, e.g. what could get moved into:
https://github.com/neomjs/neo/blob/dev/src/component/Abstract.mjs#L284

- 2025-10-26 @tobiu unassigned from @tobiu
- 2025-10-26 @tobiu assigned to @ad1tyayadav
- 2025-10-26 @ad1tyayadav cross-referenced by PR #7667
- 2025-10-27 @tobiu closed this issue

