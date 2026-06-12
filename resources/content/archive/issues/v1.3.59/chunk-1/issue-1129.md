---
id: 1129
title: importing component.Base => code shortening / cleanup
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-24T07:48:05Z'
updatedAt: '2020-08-24T08:15:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1129'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-24T08:15:23Z'
---
# importing component.Base => code shortening / cleanup

using `import {default as Component}` most of the time, since the class name is Base.

however, Base is the default export (and the only one), so we can reduce this to `import Component`.



## Timeline

- 2020-08-24T07:48:05Z @tobiu added the `enhancement` label
- 2020-08-24T07:48:05Z @tobiu assigned to @tobiu
- 2020-08-24T08:01:29Z @tobiu referenced in commit `7db3047` - "importing component.Base => code shortening / cleanup #1129"
- 2020-08-24T08:13:40Z @tobiu referenced in commit `6ced32e` - "#1129 apps folder"
- 2020-08-24T08:15:16Z @tobiu referenced in commit `bfe32b8` - "#1129 docs app"
- 2020-08-24T08:15:23Z @tobiu closed this issue
- 2020-08-24T08:16:59Z @tobiu cross-referenced by #1130

