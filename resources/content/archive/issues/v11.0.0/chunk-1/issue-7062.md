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

- 2025-07-15T17:42:05Z @tobiu assigned to @tobiu
- 2025-07-15T17:42:06Z @tobiu added the `enhancement` label
- 2025-07-15T17:42:06Z @tobiu added parent issue #6992
### @github-actions - 2025-10-14T02:41:12Z

This issue is stale because it has been open for 90 days with no activity.

- 2025-10-14T02:41:12Z @github-actions added the `stale` label
- 2025-10-14T07:37:12Z @tobiu removed the `stale` label
- 2025-10-14T07:37:12Z @tobiu added the `help wanted` label
- 2025-10-14T07:37:12Z @tobiu added the `good first issue` label
- 2025-10-14T07:37:12Z @tobiu added the `hacktoberfest` label
### @ad1tyayadav - 2025-10-26T13:23:56Z

assign me


### @tobiu - 2025-10-26T13:27:34Z

Thanks for your interest. For this one I recommend to look into:
https://github.com/neomjs/neo/blob/dev/src/component/Base.mjs#L1144
https://github.com/neomjs/neo/blob/dev/src/container/Base.mjs#L476

I would also recommend the "AI Native" workflows and let agents figure out the details, e.g. what could get moved into:
https://github.com/neomjs/neo/blob/dev/src/component/Abstract.mjs#L284

- 2025-10-26T13:27:42Z @tobiu unassigned from @tobiu
- 2025-10-26T13:27:42Z @tobiu assigned to @ad1tyayadav
- 2025-10-26T14:04:30Z @ad1tyayadav cross-referenced by PR #7667
- 2025-10-27T10:45:02Z @tobiu closed this issue

