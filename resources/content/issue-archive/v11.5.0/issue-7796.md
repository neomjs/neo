---
id: 7796
title: Enhance build scripts for Windows compatibility
state: CLOSED
labels:
  - enhancement
  - windows
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-18T19:59:44Z'
updatedAt: '2025-11-18T20:00:39Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7796'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-18T20:00:39Z'
---
# Enhance build scripts for Windows compatibility

## Description
The build scripts `createApp.mjs`, `createAppMinimal.mjs`, and the Webpack configuration files (`webpack.config.main.mjs`) use `spawnSync('node', ...)` or direct string commands assuming `node` is available. This can cause issues on Windows environments where `node.exe` is often required. To ensure cross-platform compatibility, we should use a platform-aware command for the Node.js binary.

## Goal
Update `buildScripts/createApp.mjs`, `buildScripts/createAppMinimal.mjs`, and relevant Webpack configuration files to dynamically determine the Node.js command (`node` or `node.exe`) based on the operating system.

## Acceptance Criteria
1.  Define `nodeCmd` in `buildScripts/createApp.mjs` and `buildScripts/createAppMinimal.mjs` to handle Windows (`node.exe`) vs. other platforms (`node`).
2.  Replace `spawnSync('node', ...)` calls with `spawnSync(nodeCmd, ...)` in these files.
3.  Update `buildScripts/webpack/production/webpack.config.main.mjs` and `buildScripts/webpack/development/webpack.config.main.mjs` to use `nodeCmd` in `WebpackHookPlugin` commands.


## Timeline

- 2025-11-18T19:59:45Z @tobiu added the `enhancement` label
- 2025-11-18T19:59:46Z @tobiu added the `windows` label
- 2025-11-18T19:59:46Z @tobiu added the `developer-experience` label
- 2025-11-18T19:59:46Z @tobiu added the `ai` label
- 2025-11-18T19:59:59Z @tobiu assigned to @tobiu
- 2025-11-18T20:00:31Z @tobiu referenced in commit `cb445d9` - "Enhance build scripts for Windows compatibility #7796"
- 2025-11-18T20:00:40Z @tobiu closed this issue

