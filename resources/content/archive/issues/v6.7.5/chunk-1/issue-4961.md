---
id: 4961
title: 'combine Neo.merge() & core.Base: merge()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-10-02T10:22:34Z'
updatedAt: '2023-10-02T10:25:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4961'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-02T10:25:17Z'
---
# combine Neo.merge() & core.Base: merge()

does not really make sense to have almost the same logic in 2 spots.

## Timeline

- 2023-10-02T10:22:34Z @tobiu added the `enhancement` label
- 2023-10-02T10:22:34Z @tobiu assigned to @tobiu
- 2023-10-02T10:23:03Z @tobiu referenced in commit `bf02153` - "combine Neo.merge() & core.Base: merge() #4961"
- 2023-10-02T10:23:06Z @tobiu closed this issue
- 2023-10-02T10:23:45Z @tobiu reopened this issue
### @tobiu - 2023-10-02T10:24:46Z

small oversight: while we could keep the inner `this` (pointing to Neo), using `Neo` feels cleaner.

- 2023-10-02T10:25:13Z @tobiu referenced in commit `bc466e6` - "#4961 cleanup"
- 2023-10-02T10:25:17Z @tobiu closed this issue
- 2023-10-02T10:30:11Z @tobiu referenced in commit `a7f4765` - "v6.7.5 (#4962)

* calendar.view.MainContainer: regression bug => the DateSelector jumps from null to today to july 2023 #4915

* dependencies update

* component.Base: cleanup (doc comments)

* tab.header.Toolbar: sortable #4767

* core.Base: merge() => must not call itself recursively for null values #4960

* combine Neo.merge() & core.Base: merge() #4961

* #4961 cleanup

* v6.7.5"

