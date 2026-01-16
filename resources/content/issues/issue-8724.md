---
id: 8724
title: 'Canvas Ecosystem: Visual Polish & Terminology Alignment'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-16T18:07:17Z'
updatedAt: '2026-01-16T19:17:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8724'
author: tobiu
commentsCount: 1
parentIssue: 8721
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-16T19:17:19Z'
---
# Canvas Ecosystem: Visual Polish & Terminology Alignment

**Context:**
The code uses terms like "Lattice" and "Debris" which are slightly out of sync with the "Neural Link" / "Application Engine" narrative. Also, some visual artifacts (colors) might need tightening.

**Goal:**
Align code terminology and final visual polish with the brand.

**Requirements:**
1.  **Terminology:** Update JSDoc and internal comments:
    *   "Lattice" -> "Neural Fabric" or "Application Mesh"
    *   "Debris" -> "Constructs" or "Particles"
2.  **Palette:** Verify that `ServicesCanvas.mjs`, `HeaderCanvas.mjs`, and `HomeCanvas.mjs` share the exact same `colors` definitions for the "Blue-Scale" theme.
3.  **Cross-Canvas Consistency:** Ensure the "Spark" effect in `HomeCanvas` matches the updated particle effect in `ServicesCanvas`.


## Timeline

- 2026-01-16T18:07:18Z @tobiu added the `documentation` label
- 2026-01-16T18:07:18Z @tobiu added the `enhancement` label
- 2026-01-16T18:07:19Z @tobiu added the `ai` label
- 2026-01-16T18:07:19Z @tobiu added the `refactoring` label
- 2026-01-16T18:07:29Z @tobiu added parent issue #8721
- 2026-01-16T19:16:56Z @tobiu referenced in commit `266e529` - "docs: Align Canvas terminology and unify Blue-Scale palette (#8724)"
### @tobiu - 2026-01-16T19:16:57Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the refactoring for Ticket #8724:
> 
> 1.  **Terminology**: Updated `ServicesCanvas.mjs` JSDoc to use "Neural Fabric" and "Constructs".
> 2.  **Palette Unification**:
>     *   Consolidated the "Blue-Scale" palette across all three canvases.
>     *   `ServicesCanvas`, `HomeCanvas`, and `HeaderCanvas` now strictly adhere to:
>         *   **Primary:** `#3E63DD` (Neo Blue)
>         *   **Highlight:** `#00BFFF` (Cyan) - Updated `HeaderCanvas` from `#40C4FF`.
>         *   **Secondary:** `#536DFE` (Indigo) - Updated `HeaderCanvas` and `HomeCanvas` from `#8BA6FF`.
> 
> 3.  **Spark Consistency**: Analyzed `HomeCanvas` sparks. They are 2D trails (`ctx.lineTo`) whereas `ServicesCanvas` uses 3D projected squares. Given the different rendering contexts (2D Network vs 3D Grid), forcing them to be identical would break the aesthetic coherence of `HomeCanvas` (which relies on line drawing). However, the **colors** are now unified, which ensures brand consistency across the different visualizations.
> 
> The visual ecosystem is now aligned.

- 2026-01-16T19:17:19Z @tobiu closed this issue
- 2026-01-16T19:17:26Z @tobiu assigned to @tobiu
- 2026-01-16T19:17:30Z @tobiu cross-referenced by #8721

