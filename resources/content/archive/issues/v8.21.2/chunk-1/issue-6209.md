---
id: 6209
title: Blog Post - Creating a buffered grid
state: CLOSED
labels:
  - enhancement
  - Blog Post
assignees:
  - tobiu
createdAt: '2025-01-12T23:02:06Z'
updatedAt: '2025-02-12T09:02:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6209'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-12T09:02:02Z'
---
# Blog Post - Creating a buffered grid

We need to start very simple, since most developers simply don't even understand the basics

1. why do we need a data & a view layer for big datasets?
2. what is a record? (object with change events, 1 & multiple props, dirty flag => changed value(s))
3. what is a collection? (combination of array & map with mutation events => splice => insert, remove or combinations)
4. reactive filters & sorters
5. view layer => you can only see a fraction of the data, this data is reflected inside the `vdom`, nothing more
6. data changes outside the visible area have no effect
7. navigating to a different view area always shows the latest data
8. buffered rows
9. buffered columns

## Timeline

- 2025-01-12T23:02:06Z @tobiu added the `Blog Post` label
- 2025-01-12T23:02:06Z @tobiu added the `enhancement` label
- 2025-01-12T23:02:06Z @tobiu assigned to @tobiu
### @tobiu - 2025-02-12T09:02:02Z

https://tobiasuhlig.medium.com/building-a-blazing-fast-buffered-data-grid-in-public-7698bc781113?source=friends_link&sk=349893c757c5134671b16a643f35cf54

- 2025-02-12T09:02:03Z @tobiu closed this issue

