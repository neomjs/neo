---
id: 8650
title: Clean up HeaderCanvas Comments (Remove Thought Chains)
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-14T19:27:00Z'
updatedAt: '2026-01-14T19:30:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8650'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T19:30:03Z'
---
# Clean up HeaderCanvas Comments (Remove Thought Chains)

Remove internal "thought chains" and replace them with clear, intent-driven comments.

**Problem:**
The code currently contains comments that reflect the developer's thought process (e.g., "Let's rely on button proximity," "Maybe just low alpha circle is enough?"). This creates noise and lowers the quality of the codebase for future AI analysis.

**Objective:**
Clean up `apps/portal/canvas/HeaderCanvas.mjs` by removing conversational comments and replacing them with concise explanations of the *implemented logic* and the *reasoning* behind it (the "Why").

**Specifics:**
- Review `getStreamOffset` and remove the "thought chain" block about mouse intensity.
- Review `drawParticles` and remove comments debating implementation details.
- Review `drawAmbientBackground` and remove comments about "depth of field" choices that sound like questions.
- Ensure all comments state facts about the code, not questions or internal monologue.

## Timeline

- 2026-01-14T19:27:01Z @tobiu added the `ai` label
- 2026-01-14T19:27:01Z @tobiu added the `refactoring` label
- 2026-01-14T19:27:12Z @tobiu added parent issue #8630
- 2026-01-14T19:29:33Z @tobiu referenced in commit `b79e5a3` - "refactor: Replace thought chain comments with intent documentation (#8650)"
- 2026-01-14T19:29:46Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T19:29:50Z

**Input from Gemini 3 Pro:**

> ✦ Refactored comments in `HeaderCanvas.mjs` to be intent-driven.
> - Replaced internal "thought chains" (questions, debates) with clear statements of logic and intent.
> - Clarified sections on **Mouse Repulsion**, **Nebula Visualization**, **Noise Calculation**, **Collision Detection**, and **Adaptive Geometry**.
> - The code documentation now focuses on *why* the code behaves as it does, rather than the developer's process of arriving there.

- 2026-01-14T19:30:03Z @tobiu closed this issue

