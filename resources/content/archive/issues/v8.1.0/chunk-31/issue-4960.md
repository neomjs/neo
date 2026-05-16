---
id: 4960
title: 'core.Base: merge() => must not call itself recursively for null values'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2023-10-02T09:52:22Z'
updatedAt: '2023-10-02T09:53:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4960'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-10-02T09:53:35Z'
---
# core.Base: merge() => must not call itself recursively for null values

*(No description provided)*

## Timeline

- 2023-10-02T09:52:22Z @tobiu added the `bug` label
- 2023-10-02T09:53:00Z @tobiu referenced in commit `2af4af5` - "core.Base: merge() => must not call itself recursively for null values #4960"
### @tobiu - 2023-10-02T09:53:35Z

without the change:
<img width="769" alt="Screenshot 2023-10-02 at 11 44 10" src="https://github.com/neomjs/neo/assets/1177434/80f2ef8c-b4f1-49bc-9731-b27b692e3e93">

with the change:
<img width="758" alt="Screenshot 2023-10-02 at 11 51 25" src="https://github.com/neomjs/neo/assets/1177434/2333928e-e72a-4d1a-a3de-a480f78eb553">

- 2023-10-02T09:53:35Z @tobiu closed this issue
- 2023-10-02T10:30:11Z @tobiu referenced in commit `a7f4765` - "v6.7.5 (#4962)

* calendar.view.MainContainer: regression bug => the DateSelector jumps from null to today to july 2023 #4915

* dependencies update

* component.Base: cleanup (doc comments)

* tab.header.Toolbar: sortable #4767

* core.Base: merge() => must not call itself recursively for null values #4960

* combine Neo.merge() & core.Base: merge() #4961

* #4961 cleanup

* v6.7.5"

