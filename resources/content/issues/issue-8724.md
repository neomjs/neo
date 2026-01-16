---
id: 8724
title: 'Canvas Ecosystem: Visual Polish & Terminology Alignment'
state: OPEN
labels:
  - documentation
  - enhancement
  - ai
  - refactoring
assignees: []
createdAt: '2026-01-16T18:07:17Z'
updatedAt: '2026-01-16T18:07:17Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8724'
author: tobiu
commentsCount: 0
parentIssue: 8721
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

