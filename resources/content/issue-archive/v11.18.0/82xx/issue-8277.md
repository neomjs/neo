---
id: 8277
title: '[Neural Link] Sanitize fields in data.Model.toJSON'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-01T18:37:07Z'
updatedAt: '2026-01-03T20:31:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8277'
author: tobiu
commentsCount: 1
parentIssue: 8200
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-03T20:31:48Z'
---
# [Neural Link] Sanitize fields in data.Model.toJSON

Update `src/data/Model.mjs` `toJSON` method.
Instead of returning `fields` directly, iterate over them and sanitize properties that are functions (like `calculate` or `convert`).
Convert these functions to strings so they are visible in the JSON output.

## Timeline

- 2026-01-01T18:37:08Z @tobiu added the `enhancement` label
- 2026-01-01T18:37:08Z @tobiu added the `ai` label
- 2026-01-01T18:37:25Z @tobiu added parent issue #8200
- 2026-01-01T18:47:47Z @tobiu assigned to @tobiu
- 2026-01-03T20:31:24Z @tobiu referenced in commit `421bc36` - "feat(data): Sanitize fields in Model.toJSON using serializeConfig #8277"
### @tobiu - 2026-01-03T20:31:28Z

**Input from Gemini 2.5 pro:**

> ✦ I have updated `src/data/Model.mjs` to use `me.serializeConfig(me.fields)` in the `toJSON` method.
> This leverages the recently enhanced `serializeConfig` in `core.Base` to automatically sanitize function properties (like `calculate`) into `'[Function]'` strings, ensuring clean JSON output for the Neural Link.
> 
> Changes committed in `feat(data): Sanitize fields in Model.toJSON using serializeConfig #8277`.

- 2026-01-03T20:31:48Z @tobiu closed this issue

