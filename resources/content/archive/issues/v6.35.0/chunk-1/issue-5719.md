---
id: 5719
title: 'Portal.view.blog.List: image preloading only works when starting with the blog route'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2024-08-07T07:42:41Z'
updatedAt: '2024-08-07T09:00:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5719'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-07T09:00:58Z'
---
# Portal.view.blog.List: image preloading only works when starting with the blog route

interesting one: the IntersectionObserver registers fine, but it feels like it can not handle moving DOM nodes.

will take a look.

## Timeline

- 2024-08-07T07:42:41Z @tobiu added the `bug` label
- 2024-08-07T07:42:41Z @tobiu assigned to @tobiu
- 2024-08-07T09:00:56Z @tobiu referenced in commit `3e2b971` - "Portal.view.blog.List: image preloading only works when starting with the blog route #5719"
- 2024-08-07T09:00:58Z @tobiu closed this issue

