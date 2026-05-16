---
id: 5475
title: 'Portal.view.home.MainContainer: lazy loading child views'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2024-06-23T19:33:34Z'
updatedAt: '2024-06-26T08:18:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5475'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-06-26T08:18:53Z'
---
# Portal.view.home.MainContainer: lazy loading child views

with the helix & colors app on the landing page, this content got too heavy.

one elegant idea: the child views (part) could always render with the LivePreview source view and once scrolling into the visible area for the first time, switching to the preview view (with a delay of 1-2s).

@maxrahder @Dinkh 

## Timeline

- 2024-06-23T19:33:34Z @tobiu added the `enhancement` label
### @tobiu - 2024-06-26T08:18:53Z

we can close this one, since all LivePreviews start with the source view now and switch to the preview view when getting scrolled into the visible area => this will lazy-load the related apps.

- 2024-06-26T08:18:53Z @tobiu closed this issue

