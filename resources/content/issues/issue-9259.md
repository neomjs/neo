---
id: 9259
title: 'Create Frontend Guide 1: Architecture & Off-Main-Thread'
state: OPEN
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T17:47:15Z'
updatedAt: '2026-02-22T17:48:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9259'
author: tobiu
commentsCount: 0
parentIssue: 9257
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Frontend Guide 1: Architecture & Off-Main-Thread

**Objective:**
Explain the App Worker paradigm and the MVVM setup for DevIndex.

**Tasks:**
- Create `learn/guides/devindex/frontend/Architecture.md`.
- Explain how `index.html` only loads the micro-loader.
- Detail how the entire `Viewport`, `MainContainer`, and `MVVM` logic runs in a separate thread.
- Explain the benefits of "Off-Main-Thread" for keeping the DOM fast.

## Timeline

- 2026-02-22T17:47:16Z @tobiu added the `documentation` label
- 2026-02-22T17:47:16Z @tobiu added the `ai` label
- 2026-02-22T17:48:13Z @tobiu assigned to @tobiu
- 2026-02-22T17:48:36Z @tobiu added parent issue #9257

