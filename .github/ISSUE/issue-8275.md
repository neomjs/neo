---
id: 8275
title: '[Neural Link] Export controller in component.Base.toJSON'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:37:02Z'
updatedAt: '2026-01-01T18:47:30Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8275'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Export controller in component.Base.toJSON

Export the `controller` configuration in `toJSON`.
If it is an instance, return `{ className, id }`.
If it is a configuration object or string, return it as is.
This allows the Neural Link to identify which controller manages a component.

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu assigned to @tobiu

