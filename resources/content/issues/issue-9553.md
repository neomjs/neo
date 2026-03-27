---
id: 9553
title: 'Feature: Implement Pipeline Interceptor System (Middleware)'
state: OPEN
labels:
  - enhancement
  - help wanted
  - no auto close
  - ai
  - architecture
  - core
assignees: []
createdAt: '2026-03-25T20:10:19Z'
updatedAt: '2026-03-26T15:19:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9553'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feature: Implement Pipeline Interceptor System (Middleware)

### Goal
Implement a middleware/interceptor system for `Neo.data.Pipeline` to allow cross-cutting concerns to be handled declaratively.

### Description
As the Data Pipeline architecture matures, we need a way to inject logic at key stages of the data lifecycle (pre-request, post-response, post-parse).

**Requirements:**
1. Support `request` interceptors (e.g., adding Auth headers, logging params).
2. Support `response` interceptors (e.g., global error handling, refreshing tokens).
3. Interceptors must support `async` execution.
4. Allow global interceptors to be registered at the `Neo.worker.Data` level.
5. Pipelines should allow instance-specific interceptors that merge with globals.

## Timeline

- 2026-03-25T20:10:19Z @tobiu assigned to @tobiu
- 2026-03-25T20:10:20Z @tobiu added the `enhancement` label
- 2026-03-25T20:10:20Z @tobiu added the `ai` label
- 2026-03-25T20:10:20Z @tobiu added the `architecture` label
- 2026-03-25T20:10:21Z @tobiu added the `core` label
- 2026-03-25T20:51:06Z @tobiu added the `help wanted` label
- 2026-03-25T20:51:06Z @tobiu added the `no auto close` label
- 2026-03-26T15:19:45Z @tobiu unassigned from @tobiu

