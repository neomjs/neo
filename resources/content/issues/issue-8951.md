---
id: 8951
title: 'Feat: Smart Initialization for SparklineComponent'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-02-02T14:01:09Z'
updatedAt: '2026-02-02T14:01:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8951'
author: tobiu
commentsCount: 0
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Smart Initialization for SparklineComponent

Update `DevRank.view.SparklineComponent` to demonstrate the "Smart Component" pattern.

**Logic:**
1.  **Check:** On initialization, query if the Canvas Worker is available.
2.  **Start:** If not, call `Neo.worker.Manager.startWorker('canvas')`.
3.  **Load:** Call `Canvas.loadModule('apps/devrank/canvas/Sparkline.mjs')`.
4.  **Register:** Proceed with `register()` only after these steps succeed.

**Note:** This removes the need for `canvas.mjs` entry point edits for this component.

## Timeline

- 2026-02-02T14:01:10Z @tobiu added the `enhancement` label
- 2026-02-02T14:01:10Z @tobiu added the `ai` label
- 2026-02-02T14:01:18Z @tobiu added parent issue #8948

