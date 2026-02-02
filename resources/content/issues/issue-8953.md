---
id: 8953
title: 'Feat: Optional Canvas Worker Entry Point (`useCanvasWorkerStartingPoint`)'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-02-02T21:50:16Z'
updatedAt: '2026-02-02T21:50:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8953'
author: tobiu
commentsCount: 0
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Optional Canvas Worker Entry Point (`useCanvasWorkerStartingPoint`)

To achieve true "Zero Config" for workers, we need to handle the `canvas.mjs` entry point requirement.
Currently, `Neo.worker.Canvas` unconditionally attempts to import `canvas.mjs` from the app's directory. This causes a network 404 error for apps that use the Canvas Worker (e.g., for `Sparkline`) but don't have a dedicated `canvas.mjs` entry point.

**Goal:**
Allow apps to use the Canvas Worker without requiring a `canvas.mjs` file if they only use "Smart Components" that load their own modules.

**Strategy (Option B):**
1.  Introduce a new config: `useCanvasWorkerStartingPoint` (default: `false`).
2.  Update `Neo.worker.Canvas.onRegisterNeoConfig` to check this flag before importing `canvas.mjs`.
3.  Remove `apps/devrank/canvas.mjs`.

**Why Option B?**
- Cleaner than catching 404s.
- Explicit intent.
- Breaking change is acceptable as no external canvas apps exist yet.

**Tasks:**
1.  Update `src/DefaultConfig.mjs` to include `useCanvasWorkerStartingPoint: false`.
2.  Update `src/worker/Canvas.mjs` to use this config.
3.  Delete `apps/devrank/canvas.mjs`.
4.  Verify DevRank still works (Sparkline loads via `loadModule`, no 404 for `canvas.mjs`).

## Timeline

- 2026-02-02T21:50:17Z @tobiu added the `enhancement` label
- 2026-02-02T21:50:17Z @tobiu added the `ai` label
- 2026-02-02T21:50:17Z @tobiu added the `architecture` label
- 2026-02-02T21:50:45Z @tobiu added parent issue #8948

