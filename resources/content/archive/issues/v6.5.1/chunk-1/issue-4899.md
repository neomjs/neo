---
id: 4899
title: 'field.Base: getPath() => return null in case a field has no name'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-09-12T14:50:58Z'
updatedAt: '2023-09-12T14:55:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4899'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-12T14:55:00Z'
---
# field.Base: getPath() => return null in case a field has no name

inside our client app, we do have fields who have a `formGroup`, but no `name`.

`getPath()` will return the namespace, which contains other fields as a field path, and this is bad.

## Timeline

- 2023-09-12T14:50:58Z @tobiu added the `enhancement` label
- 2023-09-12T14:50:59Z @tobiu assigned to @tobiu
- 2023-09-12T14:54:44Z @tobiu referenced in commit `8eb4f61` - "field.Base: getPath() => return null in case a field has no name #4899"
- 2023-09-12T14:55:00Z @tobiu closed this issue
- 2023-09-12T14:57:44Z @tobiu referenced in commit `4c67c6d` - "v6.5.1 (#4900)

* field.Base: getPath() => return null in case a field has no name #4899

* v6.5.1"

