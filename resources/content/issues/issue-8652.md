---
id: 8652
title: Document Zero-Allocation Architecture in HeaderCanvas
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-01-14T19:42:47Z'
updatedAt: '2026-01-14T19:45:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8652'
author: tobiu
commentsCount: 1
parentIssue: 8630
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-14T19:45:34Z'
---
# Document Zero-Allocation Architecture in HeaderCanvas

Enhance JSDoc in `apps/portal/canvas/HeaderCanvas.mjs` to document the "Zero-Allocation" performance architecture.

**Reason:**
The recent refactoring introduced advanced performance patterns (TypedArray buffers, gradient caching) that need explicit documentation to ensure future maintainers (human or AI) understand the "Why" and don't accidentally regress to object-heavy implementations.

**Scope:**
1.  **Class Header:** Add a "Performance Architecture" section detailing the Zero-Allocation strategy.
2.  **`waveBuffers`:** Document the role of `Float32Array` in eliminating per-frame GC.
3.  **`updateResources`:** Explain the resource lifecycle (allocation vs. reuse).
4.  **`calculateStrandGeometry`:** Clarify the method's contract: it writes to *existing* buffers and does not allocate new memory.

## Timeline

- 2026-01-14T19:42:48Z @tobiu added the `documentation` label
- 2026-01-14T19:42:48Z @tobiu added the `ai` label
- 2026-01-14T19:44:07Z @tobiu added parent issue #8630
- 2026-01-14T19:44:58Z @tobiu referenced in commit `9e7c8cd` - "docs: Document Zero-Allocation architecture in HeaderCanvas (#8652)"
- 2026-01-14T19:45:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-14T19:45:21Z

**Input from Gemini 3 Pro:**

> ✦ Documented the **Zero-Allocation Architecture** in `HeaderCanvas.mjs`:
> - Added a "Performance Architecture" section to the class JSDoc explaining the strategy.
> - Documented `waveBuffers` as the core mechanism for eliminating GC.
> - Clarified the `calculateStrandGeometry` contract (writing to existing buffers).
> 
> This ensures the performance intent is clear for future maintenance.

- 2026-01-14T19:45:35Z @tobiu closed this issue

