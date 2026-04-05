---
id: 9715
title: Disable Memory Core Hybrid Engine Temporarily
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T08:28:56Z'
updatedAt: '2026-04-05T08:30:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9715'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-05T08:30:00Z'
---
# Disable Memory Core Hybrid Engine Temporarily

The `engine: 'both'` hybrid configuration in `memory-core/config.mjs` was inadvertently triggering `ollama serve` process spawns aggressively during testing via `SQLiteVectorManager`, maxing out the CPU and failing memory insertions (dimension mismatch errors).

This ticket tracks temporarily reverting the config back to `engine: 'chroma'` until the local SQLite vector engine and dependency booting logic is further polished. Let's switch it back for stability.

## Timeline

- 2026-04-05T08:28:58Z @tobiu added the `bug` label
- 2026-04-05T08:28:58Z @tobiu added the `ai` label
- 2026-04-05T08:29:38Z @tobiu referenced in commit `5d90ee0` - "fix(memory-core): Switch hybrid engine config back to chroma temporarily (#9715)"
- 2026-04-05T08:29:57Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-05T08:29:59Z

Switched back to `engine: chroma` inside `memory-core/config.mjs` to prevent sequential unit tests from auto-spawning zombie `ollama serve` processes and maxing out the CPU. Stabilized the build for now.

- 2026-04-05T08:30:01Z @tobiu closed this issue

