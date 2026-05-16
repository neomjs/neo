---
id: 2849
title: 'buildAll: process exit code'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2022-01-24T19:16:12Z'
updatedAt: '2022-01-24T19:16:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2849'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2022-01-24T19:16:43Z'
---
# buildAll: process exit code

not sure why this happened after the JS modules migration, but the process finishes with exit code 13.

all other build programs finish with 0.

for now, i will adjust the end with manually setting it to 0.

feel free to add a comment, in case you have a different idea.

## Timeline

- 2022-01-24T19:16:12Z @tobiu added the `enhancement` label
- 2022-01-24T19:16:12Z @tobiu assigned to @tobiu
- 2022-01-24T19:16:35Z @tobiu referenced in commit `e65c791` - "buildAll: process exit code #2849"
- 2022-01-24T19:16:43Z @tobiu closed this issue

