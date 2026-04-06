---
id: 9732
title: 'AI Infrastructure: Stabilize SQLite Graph Environment Configs'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T15:40:07Z'
updatedAt: '2026-04-06T15:43:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9732'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T15:43:17Z'
---
# AI Infrastructure: Stabilize SQLite Graph Environment Configs

### Description
Address architectural environment misalignments uncovered during the M5 Max SQLite localized infrastructure migration.

### Changes
*   **DotEnv Standardization**: Enforce `dotenv/config` invocation at the topmost boundaries of `ai/services.mjs` and `ai/mcp/server/memory-core/config.mjs` to guarantee accurate environment percolation through dynamically spawned child operations without reliance on `.zshrc` contexts alone.
*   **Graph Hierarchy Targeting**: Establish `InstanceManager` bridging within `GraphService.mjs` to unlock core hierarchical framework reflection mechanisms locally.
*   **Vector Node Cleanup**: Terminate all legacy `ChromaManager` invocations and initialization locks inside the `runSandman.mjs` background executor, completing the formal migration to Edge-native SQLite offline rendering.

## Timeline

- 2026-04-06T15:40:08Z @tobiu added the `enhancement` label
- 2026-04-06T15:40:08Z @tobiu added the `ai` label
### @tobiu - 2026-04-06T15:41:01Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Completed infrastructure stability cleanup across SDK and Sandman executors, removing ChromeManager native ties. Verified locally natively, pushed via local shell.

- 2026-04-06T15:43:15Z @tobiu assigned to @tobiu
- 2026-04-06T15:43:17Z @tobiu closed this issue
- 2026-04-06T15:45:20Z @tobiu referenced in commit `7532d42` - "feat: Stabilize SQLite Graph Environment Configs (#9732)"

