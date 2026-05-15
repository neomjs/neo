---
id: 8725
title: 'Guide: The Neural Fabric (2.5D Projection & Hexagonal Grids)'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-16T19:55:03Z'
updatedAt: '2026-01-16T19:58:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8725'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T19:58:55Z'
---
# Guide: The Neural Fabric (2.5D Projection & Hexagonal Grids)

Create a new advanced guide `learn/guides/advanced/NeuralFabric.md` documenting the architecture of `ServicesCanvas.mjs`.

**Goal:**
Document the "High-Performance 2.5D Projection" pattern used in the Neural Fabric visualization to complete the "Advanced Canvas Architecture" series.

**Structure & Quality Standards:**
Follow the established high bar set by `CanvasArchitecture.md`, `NeuralSwarm.md`, and `NeuralTimeline.md`:
1.  **"When to Use" Section:** Clear decision matrix (Pro/Con) vs other patterns.
2.  **Mermaid Diagrams:** Visualize the architecture (Buffer Layouts, Projection Pipeline, or Agent State Machine).
3.  **The Challenge:** Explain the specific problem (3D visualization without WebGL overhead).
4.  **The Solution:** Detailed technical breakdown of the 2.5D engine and Hexagonal logic.
5.  **Code Examples:** High-quality, illustrative snippets.

**Content Focus:**
1.  **2.5D Projection:** Manual 3D projection matrix (`project(x,y,z)`) in 2D canvas.
2.  **Hexagonal Data Structures:** Mapping Axial coordinates (`q`, `r`) to linear `Float32Array`.
3.  **Visual Logic:** The Agent -> Super Module construction loop (Cause & Effect).
4.  **Terminology:** Strictly adhere to "Neural Fabric" (not Lattice) and "Constructs" (not Debris) per #8724.


## Timeline

- 2026-01-16T19:55:04Z @tobiu added the `documentation` label
- 2026-01-16T19:55:05Z @tobiu added the `enhancement` label
- 2026-01-16T19:55:05Z @tobiu added the `ai` label
- 2026-01-16T19:57:25Z @tobiu referenced in commit `7f4f6cc` - "docs: Add Neural Fabric guide and update tree (#8725)"
- 2026-01-16T19:57:40Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-16T19:57:44Z

**Input from Gemini 3 Pro:**

> ✦ I have created the "Neural Fabric" guide and updated the documentation tree.
> 
> **Summary of Work:**
> 1.  **Created `learn/guides/advanced/NeuralFabric.md`**:
>     *   Documented the 2.5D manual projection architecture.
>     *   Detailed the Hexagonal Buffer layout (`q`, `r`, `x`, `y`, `scale`, `energy`).
>     *   Explained the "Cybernetic Loop" visual logic (Agent -> Construct).
>     *   Enforced correct terminology (Neural Fabric, Constructs, Agents).
> 2.  **Updated `learn/tree.json`**:
>     *   Added "Neural Fabric (2.5D Projection)" to the "Advanced Architecture" section.
> 3.  **Polish**:
>     *   Removed redundant "Related Guides" section from the new file, relying on the portal's built-in side navigation.
> 
> The guide is now live in the documentation structure.

- 2026-01-16T19:58:55Z @tobiu closed this issue

