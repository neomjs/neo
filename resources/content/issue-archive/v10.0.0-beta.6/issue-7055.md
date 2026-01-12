---
id: 7055
title: 'examples.ConfigurationViewport: make createConfigurationComponents() optionally async'
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-07-15T08:29:12Z'
updatedAt: '2025-07-15T09:29:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7055'
author: tobiu
commentsCount: 0
parentIssue: 6992
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-07-15T09:29:39Z'
---
# examples.ConfigurationViewport: make createConfigurationComponents() optionally async

- Required for functional components hosting "classic" components, in case you want to subscribe controls to components which get created inside the `createVdom()` effect.
- Rationale: we need to wait "one tick" inside the micro task queue, before the instances exist

## Timeline

- 2025-07-15T08:29:12Z @tobiu assigned to @tobiu
- 2025-07-15T08:29:13Z @tobiu added parent issue #6992
- 2025-07-15T08:29:14Z @tobiu added the `enhancement` label
- 2025-07-15T08:35:13Z @tobiu referenced in commit `219d801` - "examples.ConfigurationViewport: make createConfigurationComponents() optionally async #7055"
- 2025-07-15T09:29:39Z @tobiu closed this issue

