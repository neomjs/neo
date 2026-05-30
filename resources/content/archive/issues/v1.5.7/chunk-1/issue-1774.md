---
id: 1774
title: 'SharedCovid.view.MainContainerController: onHashChange()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-04-14T15:54:48Z'
updatedAt: '2021-04-14T15:56:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1774'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-04-14T15:56:05Z'
---
# SharedCovid.view.MainContainerController: onHashChange()

the logic is relying on `value.appName` instead of `value.appNames`.

not related to the v1.5.6 release changes, but worth a hotfix release.

## Timeline

- 2021-04-14T15:54:49Z @tobiu added the `enhancement` label
- 2021-04-14T15:54:49Z @tobiu assigned to @tobiu
- 2021-04-14T15:55:08Z @tobiu referenced in commit `90852cb` - "SharedCovid.view.MainContainerController: onHashChange() #1774"
- 2021-04-14T15:56:05Z @tobiu closed this issue

