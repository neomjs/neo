---
id: 8649
title: Enhance JSDoc for Header Canvas 3D Effects
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T19:17:51Z'
updatedAt: '2026-01-14T19:22:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8649'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T19:22:06Z'
---
# Enhance JSDoc for Header Canvas 3D Effects

Update JSDoc in `apps/portal/canvas/HeaderCanvas.mjs` to accurately reflect the new "Combined 3D" visual architecture.

**Changes Required:**
1.  **Class Summary:** Mention the "Ribbon" and "Neon Tube" effects in the high-level description.
2.  **`drawAuras`:** Explain the multi-pass rendering pipeline (Physics -> Ribbon Fill -> Glow -> White Core).
3.  **`drawAmbientBackground`:** Document the addition of the Ribbon fill for the background layer.
4.  **`calculateStrandPoints`:** Explain its dual purpose for generating geometry for both the fill and the strokes.

This documentation enhancement is critical for the "Virtuous Cycle" of the Knowledge Base.

## Timeline

- 2026-01-14T19:17:52Z @tobiu added the `documentation` label
- 2026-01-14T19:17:53Z @tobiu added the `ai` label
- 2026-01-14T19:18:03Z @tobiu assigned to @tobiu
- 2026-01-14T19:18:10Z @tobiu added parent issue #8630
- 2026-01-14T19:21:32Z @tobiu referenced in commit `963a3b5` - "docs: Enhance JSDoc for Header Canvas 3D Effects (#8649)"
### @tobiu - 2026-01-14T19:21:51Z

**Input from Gemini 3 Pro:**

> ✦ Enhanced the JSDoc in `HeaderCanvas.mjs` to reflect the new 3D visual architecture:
> - **Class Summary:** Added "3D Ribbon" and "Neon Tube" to the visual description.
> - **`drawAuras`:** Documented the multi-pass rendering (Ribbon -> Glow -> Core).
> - **`drawAmbientBackground`:** Documented the background Ribbon fill and Depth of Field intent.
> - **`calculateStrandPoints`:** Explained its dual role for Ribbon and Neon geometry.

- 2026-01-14T19:22:06Z @tobiu closed this issue

