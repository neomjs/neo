---
id: 7795
title: Improve Windows compatibility in buildAll.mjs
state: CLOSED
labels:
  - enhancement
  - windows
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-18T17:31:49Z'
updatedAt: '2025-11-18T19:47:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7795'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-18T19:47:12Z'
---
# Improve Windows compatibility in buildAll.mjs

## Description
The `buildScripts/buildAll.mjs` script currently uses `spawnSync('node', ...)` which may cause issues on Windows environments where `node.exe` is required. To ensure cross-platform compatibility, we should use a platform-aware command for the Node.js binary, similar to how `npmCmd` is handled.

## Goal
Update `buildScripts/buildAll.mjs` to dynamically determine the Node.js command (`node` or `node.exe`) based on the operating system.

## Acceptance Criteria
1.  Define `nodeCmd` in `buildScripts/buildAll.mjs` to handle Windows (`node.exe`) vs. other platforms (`node`).
2.  Replace all hardcoded `spawnSync('node', ...)` calls with `spawnSync(nodeCmd, ...)`.


## Timeline

- 2025-11-18T17:31:50Z @tobiu added the `enhancement` label
- 2025-11-18T17:31:50Z @tobiu added the `windows` label
- 2025-11-18T17:31:50Z @tobiu added the `developer-experience` label
- 2025-11-18T17:31:51Z @tobiu added the `ai` label
- 2025-11-18T19:47:08Z @tobiu assigned to @tobiu
### @tobiu - 2025-11-18T19:47:12Z

already resolved

- 2025-11-18T19:47:13Z @tobiu closed this issue

