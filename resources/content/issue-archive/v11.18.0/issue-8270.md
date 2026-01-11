---
id: 8270
title: '[Neural Link] Implement toJSON in manager.Window'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T17:26:37Z'
updatedAt: '2026-01-01T17:53:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8270'
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
# [Neural Link] Implement toJSON in manager.Window

Implement `toJSON` for the singleton `manager.Window`. This should serialize the collection of windows, ensuring each window object (`{appName, chrome, id, ...}`) is correctly serialized.

## Timeline

- 2026-01-01T17:26:38Z @tobiu added the `enhancement` label
- 2026-01-01T17:26:38Z @tobiu added the `ai` label
- 2026-01-01T17:27:02Z @tobiu added parent issue #8200
- 2026-01-01T17:52:10Z @tobiu closed this issue
- 2026-01-01T17:53:22Z @tobiu assigned to @tobiu
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

