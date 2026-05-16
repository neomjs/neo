---
id: 538
title: 'Docs app: build dev & main.addon.HighlightJS'
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2020-05-15T12:18:16Z'
updatedAt: '2020-05-15T12:44:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/538'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-15T12:44:24Z'
---
# Docs app: build dev & main.addon.HighlightJS

after a build, the docs app does not recognise the new methods which should get exposed via the remotes api. looking into it.

## Timeline

- 2020-05-15T12:18:17Z @tobiu added the `bug` label
- 2020-05-15T12:18:17Z @tobiu assigned to @tobiu
### @tobiu - 2020-05-15T12:29:47Z

ok, this is a webpack issue: the dynamically loaded addon chunks are not getting picked up (wrong paths)

- 2020-05-15T12:44:13Z @tobiu referenced in commit `c34d53d` - "Docs app: build dev & main.addon.HighlightJS #538"
### @tobiu - 2020-05-15T12:44:24Z

fixed.

- 2020-05-15T12:44:24Z @tobiu closed this issue

