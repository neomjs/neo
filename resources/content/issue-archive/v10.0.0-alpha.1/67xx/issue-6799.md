---
id: 6799
title: 'vdom.Helper: create() => refactoring needed'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-06-15T13:44:04Z'
updatedAt: '2025-06-15T13:44:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6799'
author: tobiu
commentsCount: 0
parentIssue: 6785
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-06-15T13:44:56Z'
---
# vdom.Helper: create() => refactoring needed

* The method is consuming an overloaded vdom object
* The method is returning an overloaded vnode object
* Time to get rid of this technical debt, and separate both accordingly

## Timeline

- 2025-06-15T13:44:04Z @tobiu assigned to @tobiu
- 2025-06-15T13:44:05Z @tobiu added the `enhancement` label
- 2025-06-15T13:44:05Z @tobiu added parent issue #6785
- 2025-06-15T13:44:31Z @tobiu referenced in commit `9315bfd` - "vdom.Helper: create() => refactoring needed #6799"
- 2025-06-15T13:44:56Z @tobiu closed this issue

