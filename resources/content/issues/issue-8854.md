---
id: 8854
title: Implement Footer OffscreenCanvas Overlay
state: OPEN
labels:
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T16:52:11Z'
updatedAt: '2026-01-21T17:01:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8854'
author: tobiu
commentsCount: 0
parentIssue: 8727
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Footer OffscreenCanvas Overlay

- Leverage the transparent footer structure created in #8853.
- Implement an `OffscreenCanvas` component behind the footer content (z-index 0).
- Design a subtle, high-performance visualization (e.g., particle network, mesh, or "engine room" vibe) that runs in the Canvas Worker.
- Ensure it matches the theme colors (Brand Blue / Dark Mode).
- **Goal:** Demonstrate multi-canvas performance and "Show, Don't Just Tell" the engine capabilities.

## Timeline

- 2026-01-21T16:52:13Z @tobiu added the `enhancement` label
- 2026-01-21T16:52:13Z @tobiu added the `design` label
- 2026-01-21T16:52:13Z @tobiu added the `ai` label
- 2026-01-21T17:01:04Z @tobiu assigned to @tobiu
- 2026-01-21T17:01:08Z @tobiu added parent issue #8727

