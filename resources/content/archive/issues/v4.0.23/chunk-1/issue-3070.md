---
id: 3070
title: 'main.addon.Stylesheet: addThemeFiles() => path adjustment'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2022-05-21T08:17:21Z'
updatedAt: '2022-05-21T08:19:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3070'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-05-21T08:19:02Z'
---
# main.addon.Stylesheet: addThemeFiles() => path adjustment

while the path works for the neo envs (dev & dist/*), we ran into an issue when deploying the `dist/production` folder deeply nested into a server structure on azure. 

## Timeline

- 2022-05-21T08:17:21Z @tobiu added the `bug` label
- 2022-05-21T08:17:22Z @tobiu assigned to @tobiu
- 2022-05-21T08:18:12Z @tobiu referenced in commit `ad24e80` - "main.addon.Stylesheet: addThemeFiles() => path adjustment #3070"
- 2022-05-21T08:19:02Z @tobiu closed this issue

