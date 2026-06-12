---
id: 4767
title: 'tab.header.Toolbar: sortable'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-08-22T20:48:12Z'
updatedAt: '2023-10-02T09:51:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4767'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-02T09:51:53Z'
---
# tab.header.Toolbar: sortable

just noticed that inside the docs app, sorting only works fine for the first time you do it.

afterwards the tab header toolbar still has a `height` of 25px, but it gets displayed with 1px instead.

tested using a min-height and this worked. needs further investigation.

## Timeline

- 2023-08-22T20:48:12Z @tobiu added the `bug` label
### @plutocrate - 2023-09-27T16:37:56Z

Hey @tobiu, I would like to work on this issue. May we discuss this issue in detail?

Can you attach a screenshot of the concern?

### @tobiu - 2023-09-27T16:53:32Z

hi @prathammpurohit,

unfortunately this one is not a good ticket for getting started with neo. @ExtAnimal is in the middle of adding support for smart positioned floating components. I just noticed that there is a side effect when converting rect objects into DOMRects inside the app worker. i will create a new ticket for it, since it is blocking this one.

my recommendation, in case you want to help out a bit, is to join the neo slack channel and get connected.

best regards,
tobias

- 2023-09-27T16:58:51Z @tobiu cross-referenced by #4948
- 2023-10-02T09:35:20Z @tobiu assigned to @tobiu
- 2023-10-02T09:35:32Z @tobiu referenced in commit `a6c5d2f` - "tab.header.Toolbar: sortable #4767"
- 2023-10-02T09:51:53Z @tobiu closed this issue
- 2023-10-02T10:30:11Z @tobiu referenced in commit `a7f4765` - "v6.7.5 (#4962)

* calendar.view.MainContainer: regression bug => the DateSelector jumps from null to today to july 2023 #4915

* dependencies update

* component.Base: cleanup (doc comments)

* tab.header.Toolbar: sortable #4767

* core.Base: merge() => must not call itself recursively for null values #4960

* combine Neo.merge() & core.Base: merge() #4961

* #4961 cleanup

* v6.7.5"

