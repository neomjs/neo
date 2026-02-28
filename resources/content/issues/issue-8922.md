---
id: 8922
title: 'Feat: Implement Neo.container.Spatial (Pan/Zoom Whiteboard)'
state: OPEN
labels:
  - design
  - feature
assignees: []
createdAt: '2026-01-31T14:24:51Z'
updatedAt: '2026-01-31T14:24:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8922'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Implement Neo.container.Spatial (Pan/Zoom Whiteboard)

Create a container designed for infinite 2D spatial layouts (whiteboard style).

**Features:**
1.  **Infinite Pan:** Drag background to pan. Integrate `GridDragScroll` physics for momentum.
2.  **Vector Zoom:** Wheel/Pinch to scale the view.
3.  **Virtualization (Optional/Phase 2):** Culling items outside the viewport for massive scale.

**Use Cases:**
- Node Editors (Blueprints)
- Whiteboards
- Interactive Maps (Non-GIS)
- Desktop-like Window Managers (inside a browser tab)

## Timeline

- 2026-01-31T14:24:52Z @tobiu added the `design` label
- 2026-01-31T14:24:52Z @tobiu added the `feature` label

