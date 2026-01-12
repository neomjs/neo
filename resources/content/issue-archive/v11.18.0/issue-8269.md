---
id: 8269
title: '[Neural Link] Implement toJSON in manager.DragCoordinator'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T17:26:33Z'
updatedAt: '2026-01-01T17:53:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8269'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-01T17:52:09Z'
---
# [Neural Link] Implement toJSON in manager.DragCoordinator

Implement `toJSON` for the singleton `manager.DragCoordinator` to expose `activeTargetZone` and `sortZones` for AI inspection.

## Timeline

- 2026-01-01T17:26:34Z @tobiu added the `enhancement` label
- 2026-01-01T17:26:34Z @tobiu added the `ai` label
- 2026-01-01T17:26:59Z @tobiu added parent issue #8200
- 2026-01-01T17:52:09Z @tobiu closed this issue
- 2026-01-01T17:53:10Z @tobiu assigned to @tobiu
- 2026-01-04T03:10:28Z @jonnyamsp referenced in commit `aaeaa6e` - "feat(ai): Implement Neural Link toJSON protocol for Client Services and Managers

- Implement toJSON in manager.DragCoordinator
- Implement toJSON in manager.Window
- Refactor ComponentService to use toJSON protocol
- Refactor DataService to use toJSON protocol
- Refactor RuntimeService to use toJSON protocol
- Update ai.client.Service.safeSerialize to prioritize toJSON

Closes #8269
Closes #8270
Closes #8271
Closes #8272
Closes #8273"

