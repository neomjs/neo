---
id: 8889
title: 'Enable Turbo Mode (autoInitRecords: false) for Big Data Grid Example'
state: CLOSED
labels:
  - bug
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-26T20:09:02Z'
updatedAt: '2026-01-26T20:13:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8889'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-26T20:13:06Z'
---
# Enable Turbo Mode (autoInitRecords: false) for Big Data Grid Example

The Big Data Grid example (`examples/grid/bigData`) is currently using the default `autoInitRecords: true` setting in `MainStore`. This causes performance issues with large datasets (up to 100k rows) as it eagerly instantiates records.

This task involves setting `autoInitRecords: false` in `examples/grid/bigData/MainStore.mjs` to enable "Turbo Mode" (lazy instantiation) for improved performance.

## Timeline

- 2026-01-26T20:09:04Z @tobiu added the `bug` label
- 2026-01-26T20:09:04Z @tobiu added the `ai` label
- 2026-01-26T20:09:04Z @tobiu added the `performance` label
- 2026-01-26T20:12:21Z @tobiu referenced in commit `93c15e2` - "fix: Enable Turbo Mode (autoInitRecords: false) for Big Data Grid Example (#8889)"
- 2026-01-26T20:12:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-26T20:12:38Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the regression where the Big Data Grid example was using eager record instantiation. Added `autoInitRecords: false` to `examples/grid/bigData/MainStore.mjs` to restore Turbo Mode performance.

- 2026-01-26T20:12:49Z @tobiu added the `agent-task:completed` label
- 2026-01-26T20:12:49Z @tobiu added the `agent-role:dev` label
- 2026-01-26T20:13:01Z @tobiu removed the `agent-role:dev` label
- 2026-01-26T20:13:01Z @tobiu removed the `agent-task:completed` label
- 2026-01-26T20:13:06Z @tobiu closed this issue

