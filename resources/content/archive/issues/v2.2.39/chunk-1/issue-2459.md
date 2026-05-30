---
id: 2459
title: 'calendar.view.MainContainer: SettingsContainer lazy loading strategy'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-06-24T19:02:54Z'
updatedAt: '2021-06-25T12:08:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2459'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-06-25T12:08:38Z'
---
# calendar.view.MainContainer: SettingsContainer lazy loading strategy

the current logic is to lazy load the settings container in case the `useSettingsContainer` does get set to true => `afterSetUseSettingsContainer()`.

it would be smarter to also check for the expanded state => if the settings container is hidden, don't load the module, but do it when first expanding it (prior to the OP).

## Timeline

- 2021-06-24T19:02:54Z @tobiu added the `enhancement` label
- 2021-06-24T19:02:54Z @tobiu assigned to @tobiu
- 2021-06-25T12:08:24Z @tobiu referenced in commit `9736fd3` - "calendar.view.MainContainer: SettingsContainer lazy loading strategy #2459"
- 2021-06-25T12:08:38Z @tobiu closed this issue

