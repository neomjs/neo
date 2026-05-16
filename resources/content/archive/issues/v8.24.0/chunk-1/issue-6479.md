---
id: 6479
title: 'component.MagicMoveText: charsVdom class field'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-02-22T12:18:41Z'
updatedAt: '2025-02-22T12:23:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6479'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-22T12:23:54Z'
---
# component.MagicMoveText: charsVdom class field

* Once a transition is done, replace the absolute positioned chars with the plain text string
* Rationale: keeping the DOM minimal

## Timeline

- 2025-02-22T12:18:41Z @tobiu added the `enhancement` label
- 2025-02-22T12:19:15Z @tobiu referenced in commit `39d5f7d` - "component.MagicMoveText: charsVdom class field #6479"
### @tobiu - 2025-02-22T12:23:54Z

https://github.com/user-attachments/assets/c30f4b06-daea-4675-a9c3-46846ec47263

=> If we are not auto-cycling, the component will end up using a minimal DOM markup.

Combined with the new measurement caching, it is quite efficient now. @yangshun

- 2025-02-22T12:23:54Z @tobiu closed this issue
- 2025-02-22T12:59:09Z @tobiu referenced in commit `4873b96` - "component.MagicMoveText: charsVdom class field #6479"

