---
id: 558
title: Always generate the dist version index files
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-05-18T10:59:08Z'
updatedAt: '2020-05-18T14:39:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/558'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-05-18T14:39:04Z'
---
# Always generate the dist version index files

there is a check in place to only generate an index file in case it does not already exist.

with the new index.ejs logic in place plus the ability to create custom ones (using a different path), this is no longer needed and even can cause issues when changing the .ejs files.

## Timeline

- 2020-05-18T10:59:08Z @tobiu added the `enhancement` label
- 2020-05-18T10:59:08Z @tobiu assigned to @tobiu
- 2020-05-18T14:38:08Z @tobiu referenced in commit `389badc` - "Always generate the dist version index files #558"
- 2020-05-18T14:39:04Z @tobiu closed this issue

