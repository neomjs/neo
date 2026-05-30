---
id: 5187
title: List createItems attempts to navigate to the first item before it creates the items
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-01-19T15:30:46Z'
updatedAt: '2024-01-25T06:45:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5187'
author: ExtAnimal
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-01-25T06:45:59Z'
---
# List createItems attempts to navigate to the first item before it creates the items

It should not navigate on its own accord.

## Timeline

- 2024-01-19T15:30:46Z @ExtAnimal added the `bug` label
- 2024-01-19T15:42:42Z @ExtAnimal assigned to @tobiu
### @ExtAnimal - 2024-01-19T15:45:54Z

We need to get rid of this skewed `headerlessActiveIndex` concept.

The navigator just doesn't "see" items which do not match the `selector` it is configured with. So it naturally skips things which you do not want to be in the flow. You can put any kind of header or boilerplate elements within a navigable, and it will only navigate among items matching the `selector`

When navigating using index, it queries *only* the matching items.

This concept is outdated, but difficult to unpick. @tobiu needs to do it.

- 2024-01-19T15:46:08Z @ExtAnimal cross-referenced by PR #5188
- 2024-01-25T06:45:59Z @ExtAnimal closed this issue

