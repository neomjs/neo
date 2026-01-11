---
id: 6248
title: 'data.Model: fields => fields_, fieldsMap, updateFieldsMap()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-01-16T20:48:39Z'
updatedAt: '2025-01-16T20:49:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6248'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-01-16T20:49:06Z'
---
# data.Model: fields => fields_, fieldsMap, updateFieldsMap()

Calling ´getField()´ happens too often when creating records, so we need a faster access for it.

`fieldsMap` will store a name path to field object reference for direct access (including nested fields).

## Timeline

- 2025-01-16T20:48:39Z @tobiu added the `enhancement` label
- 2025-01-16T20:48:39Z @tobiu assigned to @tobiu
- 2025-01-16T20:48:56Z @tobiu referenced in commit `7891ea6` - "data.Model: fields => fields_, fieldsMap, updateFieldsMap() #6248"
- 2025-01-16T20:49:06Z @tobiu closed this issue

