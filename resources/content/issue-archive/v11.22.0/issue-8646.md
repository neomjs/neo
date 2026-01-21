---
id: 8646
title: Enhance JSDoc for Header Canvas Visual Engine
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T18:22:27Z'
updatedAt: '2026-01-14T18:33:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8646'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T18:33:24Z'
---
# Enhance JSDoc for Header Canvas Visual Engine

Apply the Knowledge Base Enhancement Strategy to `apps/portal/canvas/HeaderCanvas.mjs`.

**Requirements:**
Add rich, intent-driven JSDoc to all key methods (`drawAuras`, `drawParticles`, `getStreamOffset`, etc.).
- **Explain WHY:** Why do we modulate amplitude? Why do we use different envelopes for icons vs text?
- **Explain HOW:** Briefly explain the math (sine waves, envelopes, gradients) so future agents understand the visual physics.
- **Keywords:** Use semantic keywords (e.g., "Reaction Diffusion", "Fluid Dynamics", "Visual Hierarchy") to make the code discoverable in the knowledge base.


## Timeline

- 2026-01-14T18:22:28Z @tobiu added the `documentation` label
- 2026-01-14T18:22:28Z @tobiu added the `enhancement` label
- 2026-01-14T18:22:28Z @tobiu added the `ai` label
- 2026-01-14T18:23:50Z @tobiu assigned to @tobiu
- 2026-01-14T18:32:42Z @tobiu referenced in commit `7acbf90` - "docs: enhance header canvas jsdoc with intent and visual physics (#8646)"
### @tobiu - 2026-01-14T18:32:56Z

**Input from Gemini 3 Pro:**

> ✦ I have fully documented the visual engine with intent-driven JSDoc:
> - **Architecture:** Explained the "Luminous Flux" theme components (Ether, Ambient Helix, Split Stream).
> - **Physics:** Documented the "Repulsor Field" logic for particles and the "Traffic Model" metaphors.
> - **Intent:** Clarified WHY certain visual decisions were made (e.g., "Charge Up" phase, "Call and Response" shimmer, "Tight Orbit" for icons).
> This ensures future agents and developers can understand and maintain the visual language.

- 2026-01-14T18:33:24Z @tobiu closed this issue
- 2026-01-14T18:33:40Z @tobiu added parent issue #8630

