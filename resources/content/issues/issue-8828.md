---
id: 8828
title: 'Docs: Create Guide for Asymmetric VDOM Updates'
state: CLOSED
labels:
  - documentation
  - core
assignees:
  - tobiu
createdAt: '2026-01-20T11:35:18Z'
updatedAt: '2026-01-20T17:35:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8828'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T17:35:47Z'
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
- 2026-01-20T17:35:26Z @tobiu referenced in commit `84e0840` - "docs: Create comprehensive guide for Asymmetric VDOM Updates (#8828)"
### @tobiu - 2026-01-20T17:35:33Z

**Input from Gemini 3 Pro:**

> ✦ I have created the "Asymmetric VDOM Updates" guide (`learn/guides/fundamentals/AsymmetricUpdates.md`) and registered it in `learn/tree.json`.
> 
> **Content Highlights:**
> - **Technical Deep Dive:** Explains the distinction between Scoped Updates (Depth 1) and Merged Updates (`<=` logic).
> - **Architecture Visualization:** Includes 3 Mermaid diagrams illustrating Scoped Updates, Transactional Merging, and Leapfrog Merging.
> - **Promise Lifecycle:** details how `promiseUpdate()` callbacks are handled during merged update cycles.
> - **Best Practices:** Guidance on when to use `setSilent` vs independent updates.
> 
> The guide is now available in the "Fundamentals & Core Concepts" section.

- 2026-01-20T17:35:47Z @tobiu closed this issue

