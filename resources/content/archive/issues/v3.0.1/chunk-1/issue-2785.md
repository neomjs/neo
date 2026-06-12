---
id: 2785
title: 'component.Base:getDomRect() => convenience shortcut'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-01-01T12:02:21Z'
updatedAt: '2022-01-01T12:48:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2785'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-01T12:46:40Z'
---
# component.Base:getDomRect() => convenience shortcut

We are using `Neo.main.DomAccess.getBoundingClientRect()` 30+ times inside the `src` folder and there are more occurences inside the apps folder, so a convenience shortcut feels needed.

## Timeline

- 2022-01-01T12:02:21Z @tobiu added the `enhancement` label
- 2022-01-01T12:02:21Z @tobiu assigned to @tobiu
- 2022-01-01T12:03:07Z @tobiu referenced in commit `cc7019c` - "Neo.getDomRect() => convenience shortcut #2785"
### @tobiu - 2022-01-01T12:07:21Z

thinking more about it, we should move the shortcut into `component.Base`, since this allows us to use default values for `appName` and `id`.

- 2022-01-01T12:07:52Z @tobiu referenced in commit `28dfd37` - "#2785 moved the logic into component.Base"
- 2022-01-01T12:10:51Z @tobiu referenced in commit `2252b63` - "#2785 testing the logic inside the calendar week view"
- 2022-01-01T12:14:04Z @tobiu referenced in commit `b2ab6a5` - "#2785"
- 2022-01-01T12:32:30Z @tobiu referenced in commit `3c89cb6` - "#2785"
- 2022-01-01T12:40:12Z @tobiu referenced in commit `a6d742c` - "#2785 => src folder"
- 2022-01-01T12:40:31Z @tobiu changed title from **Neo.getDomRect() => convenience shortcut** to **component.Base:getDomRect() => convenience shortcut**
- 2022-01-01T12:43:39Z @tobiu referenced in commit `c6f4618` - "#2785 => shared covid app"
- 2022-01-01T12:46:40Z @tobiu closed this issue

