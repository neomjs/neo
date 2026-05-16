---
id: 1896
title: Enhance the RealWorld demo app with lazy loading
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-29T21:30:14Z'
updatedAt: '2021-04-29T22:43:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1896'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-29T22:43:10Z'
---
# Enhance the RealWorld demo app with lazy loading

Just took a look into the code and it should be pretty simple.

mostly:
RealWorld.view.MainContainer
RealWorld.view.MainContainerController

=> remove the static imports for all views and go for dynamic ones instead. webpack can easily handle it now.

Thoughts? @mrsunshine 

## Timeline

- 2021-04-29T21:30:14Z @tobiu added the `enhancement` label
- 2021-04-29T21:30:14Z @tobiu assigned to @tobiu
- 2021-04-29T21:42:27Z @tobiu referenced in commit `5545bc5` - "#1896 RealWorld.view.MainContainer: removed the HomeComponent import"
- 2021-04-29T22:08:17Z @tobiu referenced in commit `2a20df8` - "#1896 RealWorld.view.MainContainerController: lazy loading views"
### @tobiu - 2021-04-29T22:43:10Z

done :)

- 2021-04-29T22:43:10Z @tobiu closed this issue

