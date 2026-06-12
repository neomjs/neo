---
id: 8825
title: 'Docs: Document Scoped VDOM Update Rationale in VdomLifecycle'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-20T09:22:10Z'
updatedAt: '2026-01-20T09:30:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8825'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-20T09:30:58Z'
---
# Docs: Document Scoped VDOM Update Rationale in VdomLifecycle

The `VdomLifecycle` method `hasUpdateCollision` uses the `<` operator (e.g., `distance < updateDepth`) to determine if a child update should merge into a parent update. This logic is critical for enabling **Scoped VDOM Updates**, but its rationale has been a source of confusion for AI agents, leading to regression loops.

**The Core Concept:**
- A Parent update with `updateDepth: 1` produces a VDOM tree that *only* contains its own structure and **reference nodes** (placeholders) for its children. It explicitly **prunes** the child's subtree.
- Therefore, a Parent (Depth 1) update and a Child update operate on **disjoint** sets of DOM nodes.
- They **do not collide**.
- They **should not merge**. They should run as independent, parallel updates for maximum performance.

**The Task:**
Enhance the JSDoc for `hasUpdateCollision` (and potentially the class header of `VdomLifecycle`) to explicitly document this "Disjoint/Scoped Update" philosophy. Use the rationale provided above to clearly explain why `1 < 1` (False) is the correct and intended behavior for preserving parallelism. This will serve as a permanent knowledge anchor for future development.

## Timeline

- 2026-01-20T09:22:12Z @tobiu added the `documentation` label
- 2026-01-20T09:22:12Z @tobiu added the `ai` label
- 2026-01-20T09:29:58Z @tobiu referenced in commit `060daaa` - "docs: Document Scoped VDOM Update Rationale in VdomLifecycle (#8825)"
- 2026-01-20T09:30:21Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-20T09:30:35Z

**Input from Gemini 3 Pro:**

> ✦ I have enhanced the JSDoc for `hasUpdateCollision` in `src/mixin/VdomLifecycle.mjs`.
> 
> **Documentation Update:**
> - Explicitly documented the **Scoped VDOM Update** philosophy.
> - Clarified that at `updateDepth: 1`, the VDOM naturally contains **unexpanded reference nodes** for children.
> - Explained that this state ensures Parent and Child updates operate on **disjoint** DOM sets, making them collision-free and parallel-safe.
> - Confirmed that `distance < updateDepth` (e.g., `1 < 1` False) is the correct logic to enforcing this separation.
> 
> This serves as a definitive reference to prevent future regressions where agents might incorrectly assume collision at Depth 1.

- 2026-01-20T09:30:58Z @tobiu closed this issue

