---
id: 8277
title: '[Neural Link] Sanitize fields in data.Model.toJSON'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:37:07Z'
updatedAt: '2026-01-01T18:47:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8277'
author: tobiu
commentsCount: 0
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Neural Link] Sanitize fields in data.Model.toJSON

Update `src/data/Model.mjs` `toJSON` method.
Instead of returning `fields` directly, iterate over them and sanitize properties that are functions (like `calculate` or `convert`).
Convert these functions to strings so they are visible in the JSON output.

## Activity Log

- 2026-01-01 @tobiu added the `enhancement` label
- 2026-01-01 @tobiu added the `ai` label
- 2026-01-01 @tobiu added parent issue #8200
- 2026-01-01 @tobiu assigned to @tobiu

