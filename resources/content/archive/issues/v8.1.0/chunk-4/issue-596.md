---
id: 596
title: buildScripts/webpack/* json imports
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-22T15:36:36Z'
updatedAt: '2020-05-22T15:52:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/596'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-22T15:52:49Z'
---
# buildScripts/webpack/* json imports

simplify the import logic to use require() instead of:

`JSON.parse(fs.readFileSync(path.resolve(processRoot, 'package.json'), 'utf8'))`

## Timeline

- 2020-05-22T15:36:36Z @tobiu added the `enhancement` label
- 2020-05-22T15:36:36Z @tobiu assigned to @tobiu
- 2020-05-22T15:52:44Z @tobiu referenced in commit `9f1a216` - "buildScripts/webpack/* json imports #596"
- 2020-05-22T15:52:49Z @tobiu closed this issue

