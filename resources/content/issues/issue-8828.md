---
id: 8828
title: 'Docs: Create Guide for Asymmetric VDOM Updates'
state: OPEN
labels:
  - documentation
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T11:35:18Z'
updatedAt: '2026-01-20T11:35:29Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8828'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Docs: Create Guide for Asymmetric VDOM Updates

We need to create a comprehensive guide on **Asymmetric VDOM Updates** to document the powerful optimization capabilities of the v11 VDOM engine. While the concept was introduced in v10 blogs, the specific implementation details and usage patterns (especially for AI agents) have evolved with recent architectural refinements.

**Key Concepts to Cover:**
1.  **Scoped Updates:** Explain how `updateDepth: 1` ensures updates are disjoint and parallel-safe by default.
2.  **Merging & Aggregation:** Detail how `canMergeUpdate` (`<=`) allows disjoint updates (e.g., Parent + multiple Children) to be bundled into a single worker message for efficiency.
3.  **The Transaction Pattern:** Document the `setSilent` + `parent.update()` pattern for manually batching updates across a component subtree (e.g., a Toolbar updating multiple Buttons).
4.  **Best Practices:** Guidelines for when to use independent updates vs. merged updates.

**Deliverables:**
1.  Create `learn/guides/fundamentals/AsymmetricUpdates.md`.
2.  Integrate the new guide into `learn/tree.json` under "Fundamentals & Core Concepts".
3.  Review and potentially cross-reference `learn/blog/v10-deep-dive-vdom-revolution.md` to ensure consistency.

**Context:**
This guide is essential for developers and AI agents to understand how to leverage the full performance potential of the Neo.mjs engine.

## Timeline

- 2026-01-20T11:35:19Z @tobiu added the `documentation` label
- 2026-01-20T11:35:19Z @tobiu added the `core` label
- 2026-01-20T11:35:29Z @tobiu assigned to @tobiu

