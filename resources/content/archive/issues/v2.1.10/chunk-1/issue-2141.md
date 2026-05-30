---
id: 2141
title: 'component.Base: destroy() => clear the domListeners set on this instance'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-24T11:32:58Z'
updatedAt: '2021-05-24T12:01:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2141'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-24T12:01:25Z'
---
# component.Base: destroy() => clear the domListeners set on this instance

`this.domListeners = [];`

this will not affect (dom) listeners the component registered on other instances.

small change, but needs testing.

## Timeline

- 2021-05-24T11:32:58Z @tobiu added the `enhancement` label
- 2021-05-24T11:32:58Z @tobiu assigned to @tobiu
- 2021-05-24T12:01:22Z @tobiu referenced in commit `1fb622b` - "component.Base: destroy() => clear the domListeners set on this instance #2141"
- 2021-05-24T12:01:25Z @tobiu closed this issue

