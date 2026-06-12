---
id: 5712
title: 'Portal.view.blog.List: lazy-loading for images'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-08-06T14:49:12Z'
updatedAt: '2024-08-06T15:16:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5712'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-06T15:16:27Z'
---
# Portal.view.blog.List: lazy-loading for images

@rwaters: while this one would be resolved with a buffered renderer / buffered store out of the box, we should add something now.

my idea is to initially not define the background-image url for each item and add an IntersectionObserver. Adding URLs while scrolling with a new config like `preloadImages` {Number} to add (pre-)load a couple more.

I will give it a try.

## Timeline

- 2024-08-06T14:49:12Z @tobiu added the `enhancement` label
- 2024-08-06T14:49:12Z @tobiu assigned to @tobiu
- 2024-08-06T15:16:25Z @tobiu referenced in commit `81b0207` - "Portal.view.blog.List: lazy-loading for images #5712"
- 2024-08-06T15:16:28Z @tobiu closed this issue

