---
id: 1764
title: 'component.Base: _controller => store the instance'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-13T21:06:01Z'
updatedAt: '2021-04-13T21:07:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1764'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-13T21:07:07Z'
---
# component.Base: _controller => store the instance

right now _controller contains the controller id and beforeGetController() resolves the instance.

we can remove this lookup and store the instance directly (same way as _model).

component.Base: destroy() will destroy the controller anyway, so there should not be any memory leaks.

## Timeline

- 2021-04-13T21:06:01Z @tobiu added the `enhancement` label
- 2021-04-13T21:06:01Z @tobiu assigned to @tobiu
- 2021-04-13T21:07:01Z @tobiu referenced in commit `ddc7e76` - "component.Base: _controller => store the instance #1764"
- 2021-04-13T21:07:08Z @tobiu closed this issue

