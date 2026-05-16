---
id: 8842
title: 'Documentation: Update AsymmetricUpdates.md for Teleportation'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-21T02:11:52Z'
updatedAt: '2026-01-21T02:16:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8842'
author: tobiu
commentsCount: 1
parentIssue: 8834
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-21T02:16:15Z'
---
# Documentation: Update AsymmetricUpdates.md for Teleportation

Update `learn/guides/fundamentals/AsymmetricUpdates.md` to reflect the shift from "Leapfrog Merging" to "Teleportation / Batched Disjoint Updates".
- Explain the new "Teleportation" concept (Disjoint Updates).
- Update or remove "Leapfrog" diagrams/explanations if they are now obsolete.
- Clarify the "Recursive Merging" strategy.
- Ensure the guide aligns with the current implementation in `src/mixin/VdomLifecycle.mjs`.

## Timeline

- 2026-01-21T02:11:53Z @tobiu added the `documentation` label
- 2026-01-21T02:11:53Z @tobiu added the `ai` label
- 2026-01-21T02:12:05Z @tobiu added parent issue #8834
- 2026-01-21T02:15:44Z @tobiu referenced in commit `18a38ef` - "docs: Update AsymmetricUpdates guide for Teleportation (#8842)"
- 2026-01-21T02:15:54Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-21T02:16:00Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `learn/guides/fundamentals/AsymmetricUpdates.md` to reflect the new "Teleportation" architecture.
> - Replaced "Leapfrog Merging" with "Recursive Merging".
> - Clarified that merging now creates a batch of disjoint payloads (`updateBatch`) instead of expanding the parent tree.
> - Updated diagrams to show disjoint processing.
> - Refined the comparison with traditional merging to avoid referencing unreleased implementations.

- 2026-01-21T02:16:15Z @tobiu closed this issue

