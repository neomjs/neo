---
id: 9555
title: 'Feature: Implementation of Data-Worker Side Caching'
state: OPEN
labels:
  - enhancement
  - help wanted
  - no auto close
  - ai
  - performance
  - core
assignees: []
createdAt: '2026-03-25T20:28:46Z'
updatedAt: '2026-03-26T15:20:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9555'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feature: Implementation of Data-Worker Side Caching

### Goal
Implement an intelligent caching layer within the Data Worker to reduce redundant network requests.

### Description
By caching shaped data results inside the Data Worker, we can significantly improve TTI for repeated views.

**Requirements:**
1. Add a `cache: boolean` configuration to `Neo.data.Pipeline`.
2. Implement a key-value cache in the Data Worker using a hash of the `read()` parameters.
3. Support `TTL` (Time-To-Live) configurations.
4. Provide an API to explicitly clear/invalidate the cache (`pipeline.clearCache()`).

## Timeline

- 2026-03-25T20:28:46Z @tobiu assigned to @tobiu
- 2026-03-25T20:28:48Z @tobiu added the `enhancement` label
- 2026-03-25T20:28:48Z @tobiu added the `ai` label
- 2026-03-25T20:28:48Z @tobiu added the `performance` label
- 2026-03-25T20:28:48Z @tobiu added the `core` label
- 2026-03-25T20:50:28Z @tobiu added the `help wanted` label
- 2026-03-25T20:50:28Z @tobiu added the `no auto close` label
- 2026-03-26T15:20:03Z @tobiu unassigned from @tobiu

