---
id: 8275
title: '[Neural Link] Export controller in component.Base.toJSON'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:37:02Z'
updatedAt: '2026-01-03T19:35:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8275'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T19:35:18Z'
---
# [Neural Link] Export controller in component.Base.toJSON

Export the `controller` configuration in `toJSON`.

**Implementation:**
- If `this.controller` exists:
    - Return the result of `this.controller.toJSON()`.
- If it is null/undefined:
    - Return null.

**Note:**
Any raw configuration object passed to the `controller` config will have been consumed and converted into an instance by the framework (via `beforeSetController`). So we only need to handle the instance or null case.

**Goal:**
Allow Neural Link to identify and inspect the controller managing a component.

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu assigned to @tobiu
- 2026-01-03 @tobiu referenced in commit `155a3d7` - "feat(component): Export controller in component.Base.toJSON (#8275)"
- 2026-01-03 @tobiu closed this issue

