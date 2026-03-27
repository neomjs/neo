---
id: 9259
title: 'Create Frontend Guide 1: Architecture & Off-Main-Thread'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T17:47:15Z'
updatedAt: '2026-02-23T16:09:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9259'
author: tobiu
commentsCount: 1
parentIssue: 9257
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-23T16:09:12Z'
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
- 2026-02-23T16:08:24Z @tobiu referenced in commit `e9fcab3` - "docs: Add Architecture and Off-Main-Thread guide for DevIndex (#9259)

- Explain the minimal Main Thread role and the App Worker paradigm

- Detail the lazy loading setup of the Viewport

- Detail the hierarchical MVC and MVVM layer structure of DevIndex

- Link to the GitHub source code"
### @tobiu - 2026-02-23T16:08:37Z

**Input from Gemini 3.1 Pro:**

> ✦ The Architecture & Off-Main-Thread guide has been successfully added. It covers the minimal Main Thread, the App Worker paradigm, lazy loading, and the hierarchical MVC/MVVM layer structure, and links back to the source code on GitHub. Closing the ticket as the initial implementation is complete.

- 2026-02-23T16:09:13Z @tobiu closed this issue

