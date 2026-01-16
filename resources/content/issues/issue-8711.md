---
id: 8711
title: Enhance ServicesCanvas with 3-Color Palette & Parallax Depth
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T15:53:50Z'
updatedAt: '2026-01-16T16:00:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8711'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T16:00:34Z'
---
# Enhance ServicesCanvas with 3-Color Palette & Parallax Depth

This task aims to align the `ServicesCanvas` visual aesthetic with the rest of the Portal application (`HomeCanvas`, `HeaderCanvas`) and add volumetric depth.

**1. 3-Color Palette Integration**
Adopt the standard Portal color variables to differentiate grid elements and add variation:
```javascript
const
    PRIMARY   = '#3E63DD', // Neo Blue
    SECONDARY = '#8BA6FF',
    HIGHLIGHT = '#00BFFF'; // Deep Sky Blue
```
*   **Grid Lines:** Use `SECONDARY` (faint) for the base lattice.
*   **Runners:** Use `PRIMARY` -> `HIGHLIGHT` gradients for high-velocity beams.
*   **Active Cells:** Use `HIGHLIGHT` for the inspection lens and active states.

**2. "Kernel" Parallax Layer**
Add a background layer to the grid to create volume.
*   **Visual:** Larger, darker, slower-moving hexagons behind the main grid.
*   **Metaphor:** The "Framework Kernel" or "Metal" running beneath the application code.
*   **Tech:** Rendered in a separate pass (or using the `cellBuffer` with a layer flag) to minimize performance cost.

## Timeline

- 2026-01-16T15:53:52Z @tobiu added the `enhancement` label
- 2026-01-16T15:53:52Z @tobiu added the `ai` label
- 2026-01-16T15:58:35Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T16:00:13Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the 3-color palette (`PRIMARY`, `SECONDARY`, `HIGHLIGHT`) and the Parallax Kernel layer.
> - **Palette:** Aligned with Portal standards.
> - **Kernel:** Added a background layer of large, slow-moving hexes to create depth.
> - **Visuals:** Tuned stroke widths and opacities for a clean "Engineering" look.

- 2026-01-16T16:00:34Z @tobiu closed this issue

