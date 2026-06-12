---
id: 7953
title: Refactor Client Configuration Consistency
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-30T15:57:56Z'
updatedAt: '2025-11-30T16:02:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7953'
author: tobiu
commentsCount: 0
parentIssue: 7931
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-30T16:02:34Z'
---
# Refactor Client Configuration Consistency

## Context
`Neo.ai.mcp.client.Client` currently has an inconsistent split between `static config` and class fields. `command` and `args` are configs, while `openApiFilePath` and `requiredEnv` are fields, despite all four serving the same purpose (configuration derived from `serverName` or passed manually).

## Goal
Normalize the configuration properties in `Client.mjs` to be consistent.

## Requirements
1.  Move `openApiFilePath` from class field to `static config` (non-reactive).
2.  Move `requiredEnv` from class field to `static config` (non-reactive).
3.  Ensure `loadServerConfig` updates these properties using `this.openApiFilePath = ...` (which works for both configs and fields, but for configs it's the proper setter).

## Deliverables
-   Cleaned up `ai/mcp/client/Client.mjs`.


## Timeline

- 2025-11-30T15:57:57Z @tobiu added the `ai` label
- 2025-11-30T15:57:57Z @tobiu added the `refactoring` label
- 2025-11-30T15:58:05Z @tobiu assigned to @tobiu
- 2025-11-30T15:58:10Z @tobiu added parent issue #7931
- 2025-11-30T16:02:19Z @tobiu referenced in commit `f6d1455` - "Refactor Client Configuration Consistency #7953"
- 2025-11-30T16:02:34Z @tobiu closed this issue

