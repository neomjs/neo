---
id: 1152
title: 'webpack dev server: initial errors on launch'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-08-31T14:22:06Z'
updatedAt: '2020-08-31T14:24:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1152'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-08-31T14:24:04Z'
---
# webpack dev server: initial errors on launch

@keckeroo found out, that adding an index.js file to the src folder will remove the startup errors.

they were not doing any damage, but still, getting rid of them is a good thing.

will add the file & a comment in there why we need it.

## Timeline

- 2020-08-31T14:22:06Z @tobiu added the `enhancement` label
- 2020-08-31T14:22:06Z @tobiu assigned to @tobiu
- 2020-08-31T14:23:56Z @tobiu referenced in commit `f3b70b9` - "webpack dev server: initial errors on launch #1152"
- 2020-08-31T14:24:04Z @tobiu closed this issue
- 2020-08-31T14:24:44Z @tobiu cross-referenced by #95

