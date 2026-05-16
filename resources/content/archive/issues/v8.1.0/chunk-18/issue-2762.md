---
id: 2762
title: Update the chalk dependency to v5.0.0
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2021-12-06T07:33:59Z'
updatedAt: '2022-01-24T20:05:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2762'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-24T20:05:28Z'
---
# Update the chalk dependency to v5.0.0

This one is a bit tricky, since the new version does no longer allow using CommonJS => `require()` syntax.

To make this work, we do need to adjust all build scripts to use `import` statements instead.

Obviously, as a first step this needs a check, if all other used dependencies support this as well.

## Timeline

- 2021-12-06T07:33:59Z @tobiu added the `enhancement` label
### @tobiu - 2022-01-24T20:05:28Z

done :)

- 2022-01-24T20:05:28Z @tobiu closed this issue

