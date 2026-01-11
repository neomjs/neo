---
id: 6489
title: 'component.MagicMoveText: createCharsVdom()'
state: CLOSED
labels:
  - enhancement
assignees: []
createdAt: '2025-02-23T12:30:25Z'
updatedAt: '2025-02-23T12:35:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6489'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-02-23T12:34:59Z'
---
# component.MagicMoveText: createCharsVdom()

* Adding better support for resize based changes
* If the cmp is not inside a transitioning OP, `onResize()` needs to regenerate the chars vdom of the current text
* This ensures that the next animation will start from the correct new spot
* `updateChars()` and `onResize()` can both use the new method (no redundancy)

## Timeline

- 2025-02-23T12:30:25Z @tobiu added the `enhancement` label
- 2025-02-23T12:30:40Z @tobiu referenced in commit `2675998` - "component.MagicMoveText: createCharsVdom() #6489"
### @tobiu - 2025-02-23T12:35:00Z

https://youtube.com/shorts/OdR1doNy6k8?feature=share

- 2025-02-23T12:35:00Z @tobiu closed this issue

