---
id: 3066
title: Building under Windows result in broken build
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2022-05-20T16:25:28Z'
updatedAt: '2022-05-20T16:39:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/3066'
author: davhm
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-05-20T16:39:35Z'
---
# Building under Windows result in broken build

**Describe the bug**
The buildscripts under windows run through without problems, but the output in the `dist/` folder cannot be loaded properly.

## Timeline

- 2022-05-20T16:25:29Z @davhm added the `bug` label
- 2022-05-20T16:37:01Z @davhm cross-referenced by PR #3067
- 2022-05-20T16:39:35Z @tobiu closed this issue
- 2022-05-20T16:39:36Z @tobiu referenced in commit `28207ac` - "Merge pull request #3067 from davhm/dev

fix(#3066): Fix Windows builds by adjusting regex for Windows filepaths (backslashes)"

