---
id: 8919
title: Refine v11.24.0 Release Notes to clarify VDOM determinism
state: CLOSED
labels:
  - documentation
  - ai
assignees: []
createdAt: '2026-01-31T13:34:54Z'
updatedAt: '2026-01-31T13:38:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8919'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-31T13:38:16Z'
---
# Refine v11.24.0 Release Notes to clarify VDOM determinism

Update the release notes to accurately attribute the stability improvements to "stable node identity" and "input consistency" rather than implying the diffing engine itself was previously non-deterministic.

Change:
"The App Worker is now the **Source of Truth**. The VDOM Worker receives a fully identified tree, making the existing diffing engine deterministic even during complex structural shifts"

To:
"The App Worker is now the **Source of Truth**. The VDOM Worker receives a fully identified tree, ensuring **stable identity** during complex structural shifts and eliminating race conditions in the update cycle."


## Timeline

- 2026-01-31T13:34:55Z @tobiu added the `documentation` label
- 2026-01-31T13:34:55Z @tobiu added the `ai` label
- 2026-01-31T13:38:16Z @tobiu closed this issue
- 2026-01-31T13:39:14Z @tobiu referenced in commit `f7f14cb` - "docs: Clarify App Worker autonomy in v11.24.0 release notes (#8919)"

