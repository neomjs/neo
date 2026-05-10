---
id: 8668
title: Implement Cluster Physics & Mutable Topology
state: CLOSED
labels:
  - enhancement
  - ai
  - performance
assignees:
  - tobiu
createdAt: '2026-01-15T02:11:59Z'
updatedAt: '2026-01-15T02:19:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8668'
author: tobiu
commentsCount: 1
parentIssue: 8661
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T02:19:55Z'
---
# Implement Cluster Physics & Mutable Topology

## Objective
Transform the `HomeCanvas` from a simple random distribution into a hierarchical cluster-based topology to support the "Neural Swarm" visualization.

## Tasks
1.  **Golden Spiral Initialization:** Replace `Math.random()` with a Golden Spiral algorithm for `initNodes` to ensure instant, uniform screen coverage.
2.  **Cluster Logic:** Define `PARENT` nodes (Cluster Centers) and `CHILD` nodes.
3.  **Physics Engine Update:**
    -   Implement "Cohesion" (Child nodes stick to Parents).
    -   Implement "Separation" (Nodes don't overlap).
    -   Implement "Drift" (Whole clusters move slowly).

## Technical Details
-   Update `STRIDE` in `HomeCanvas.mjs` to include `parentId` or `clusterId`.
-   Ensure Zero-Allocation (write to buffers).

## Timeline

- 2026-01-15T02:11:59Z @tobiu assigned to @tobiu
- 2026-01-15T02:12:01Z @tobiu added the `enhancement` label
- 2026-01-15T02:12:02Z @tobiu added the `ai` label
- 2026-01-15T02:12:02Z @tobiu added the `performance` label
- 2026-01-15T02:12:51Z @tobiu added parent issue #8661
- 2026-01-15T02:17:52Z @tobiu referenced in commit `50230c8` - "feat: Implement Golden Spiral & Cluster Physics for Neural Swarm (#8668)"
### @tobiu - 2026-01-15T02:18:26Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the Cluster Physics and Golden Spiral initialization.
> 
> **Changes:**
> 1.  **Golden Spiral:** Replaced `Math.random()` initialization with a deterministic spiral distribution. This guarantees 100% screen coverage from the first frame, eliminating the "expanding blob" artifact.
> 2.  **Cluster Topology:** Nodes are now assigned roles (`PARENT` vs `CHILD`). 10% of nodes act as Cluster Centers (Parents).
> 3.  **Parent-Child Physics:** Implemented a spring-force cohesion model. Children are attracted to their assigned Parent node, creating organic "swarms" that drift together.
> 4.  **Buffer Optimization:** Updated `STRIDE` to 7 to accommodate `parentId` without allocating new objects.
> 
> The simulation now behaves like a cohesive, living system rather than random noise.

- 2026-01-15T02:19:55Z @tobiu closed this issue

