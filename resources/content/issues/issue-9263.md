---
id: 9263
title: 'Create Frontend Guide 5: OffscreenCanvas & Parallel Rendering'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T18:10:50Z'
updatedAt: '2026-02-22T18:37:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9263'
author: tobiu
commentsCount: 1
parentIssue: 9257
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T18:37:13Z'
---
# Create Frontend Guide 5: OffscreenCanvas & Parallel Rendering

**Objective:**
Explain the "Zero-Allocation" Canvas Dedicated Worker architecture used for the DevIndex Header and Sparklines.

**Rationale:**
The DevIndex application uses OffscreenCanvas heavily to ensure 60fps animations (like the "Luminous Flux" header and the "Living Sparklines" in the grid) never block the main thread or the App Worker, proving the power of Neo.mjss multi-threaded model even during heavy data operations like scrolling or filtering.

**Tasks:**
- Create `learn/guides/devindex/frontend/OffscreenCanvas.md`.
- Detail the Dedicated Worker architecture for Canvas (`Neo.canvas.Base`), noting that using Dedicated Workers enables direct use of `requestAnimationFrame` (`rAF`) inside the worker.
- Explain the "Zero-Allocation" rendering strategy (Float32Array buffers, cached gradients) to prevent GC stutters.
- Explain the "Sparse Animation Strategy" used in `Neo.canvas.Sparkline` to handle 50+ charts without overloading the GPU.
- Update `learn/guides/devindex/tree.json` to link the new guide.

## Timeline

- 2026-02-22T18:10:51Z @tobiu added the `documentation` label
- 2026-02-22T18:10:51Z @tobiu added the `ai` label
- 2026-02-22T18:11:00Z @tobiu assigned to @tobiu
- 2026-02-22T18:11:05Z @tobiu added parent issue #9257
### @tobiu - 2026-02-22T18:34:35Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completed the `OffscreenCanvas.md` guide.
> 
> Key additions:
> - Created a strong narrative around the "Quintuple-Threaded" architecture (Main, App, VDom, Data, Canvas) explaining how they work in parallel to prevent Main Thread blocking.
> - Included a Mermaid diagram illustrating the 5-actor topology and their data flow.
> - Described the "Speed Up" Flex: how the `Luminous Flux` header animation intentionally doubles in speed during heavy grid scrolling to prove the Main Thread layout thrashing doesn't impact the Canvas Dedicated Worker.
> - Explained the "Sparse Animation Strategy" (Master Loop) for handling 50+ living sparklines simultaneously without melting the GPU.
> - Detailed the "Zero-Allocation" physics strategy (TypedArray buffers, pre-cached CanvasGradients, geometry caching) to eliminate GC stutters and maintain a locked 60fps via `requestAnimationFrame`.
> 
> The changes have been amended to the previous commit and forcefully pushed to the remote repository. Closing this issue.

- 2026-02-22T18:37:14Z @tobiu closed this issue
- 2026-02-22T22:06:44Z @tobiu referenced in commit `299e63e` - "docs: Create Frontend Guide 5 (OffscreenCanvas) (#9263)"

