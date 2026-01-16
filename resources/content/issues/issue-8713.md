---
id: 8713
title: 'Feature: Implement 2.5D Volumetric Projection for ServicesCanvas'
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-01-16T16:01:06Z'
updatedAt: '2026-01-16T16:01:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8713'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feature: Implement 2.5D Volumetric Projection for ServicesCanvas

Follow-up to the "Neural Lattice" implementation. Currently, the grid is planar (2D). To add the requested "Volume" and depth, we should implement a 2.5D or 3D projection.

**Concepts to Explore:**
1.  **Isometric / Tilted Plane:** Project the hex grid onto a tilted surface (like a floor or ceiling) to create perspective.
2.  **Multi-Layer Stack:** Visualize the "Kernel" and "Application" layers not just as parallax, but as physically stacked planes in Z-space.
3.  **3D Rotation:** Allow the grid to gently rotate in 3D space based on mouse position.

**Implementation:**
*   Update `hexToPixel` to support a Z-axis or projection matrix.
*   Update `drawHex` to render distorted polygons based on projection.

## Timeline

- 2026-01-16T16:01:07Z @tobiu added the `enhancement` label
- 2026-01-16T16:01:08Z @tobiu added the `ai` label

