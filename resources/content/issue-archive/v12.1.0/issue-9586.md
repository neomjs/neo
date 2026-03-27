---
id: 9586
title: 'Analysis: Robust Multi-Window LivePreview Routing & Base Path Resolution'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-03-27T15:08:01Z'
updatedAt: '2026-03-27T15:10:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9586'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Analysis: Robust Multi-Window LivePreview Routing & Base Path Resolution

# Background
During v12.1.0 development, we deleted `src/code/LivePreview.mjs#beforeSetWindowUrl`. This manual path calculation was originally added in #8074 to solve Windows OS path separator issues and nested "recursive" popouts. However, mapping the SharedWorker's `basePath` upward directly to the repo root fundamentally stripped out environment prefixes like `dist/development/`.

# Current State
The system now relies entirely on the Main thread's native browser relative URL resolution (e.g., evaluating `./childapps/preview/index.html` strictly against `location.href`). Initial macOS testing confirms that this successfully resolves for popouts executed from both the Portal Home route and the Learn route, preventing environment-jumping bugs.

# Risk & Verification Plan
We must perform a matrix validation to ensure the native Main thread resolution handles all historical edge cases:
1. **OS Matrix Verification:** Ensure the Windows OS path separator (`\`) bug (#9365) does not regress without the manual split/join logic.
2. **App Depth Verification:** Test popping out `LivePreview` components located in apps with varying structural depths (e.g., `apps/portal` vs `examples/component/button`).
3. **Environment Matrix Verification:** Test popouts across all environments: `development` (raw), `dist/development` (bundled), and `dist/production`.
4. **Recursive Popout Verification:** Verify that popping out a component *from inside* an already-popped-out childapp (Window 2 -> Window 3) evaluates the deep relative path correctly without generating 404 URL loops (e.g., `childapps/preview/childapps/preview/`).

## Timeline

- 2026-03-27T15:08:03Z @tobiu added the `enhancement` label
- 2026-03-27T15:08:03Z @tobiu added the `ai` label
- 2026-03-27T15:08:03Z @tobiu added the `architecture` label
- 2026-03-27T15:09:39Z @tobiu cross-referenced by #9585
- 2026-03-27T15:10:14Z @tobiu assigned to @tobiu

