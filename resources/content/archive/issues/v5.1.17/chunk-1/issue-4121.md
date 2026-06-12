---
id: 4121
title: 'form.Container: validate()'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2023-02-21T16:53:24Z'
updatedAt: '2023-02-21T16:53:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4121'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-02-21T16:53:56Z'
---
# form.Container: validate()

Triggering `isValid()` as the return value is quite expensive, since we need to find and re-iterate all nested fields twice. We can do this check inside the main for loop instead.

@Krytechs

## Timeline

- 2023-02-21T16:53:24Z @tobiu added the `enhancement` label
- 2023-02-21T16:53:24Z @tobiu assigned to @tobiu
- 2023-02-21T16:53:53Z @tobiu referenced in commit `6d6212b` - "form.Container: validate() #4121"
- 2023-02-21T16:53:56Z @tobiu closed this issue

