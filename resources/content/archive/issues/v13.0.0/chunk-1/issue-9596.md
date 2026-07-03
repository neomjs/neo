---
id: 9596
title: Fix SSG Pipeline Concurrency Hanging and Suppress Component Error Noise
state: CLOSED
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-03-29T22:29:22Z'
updatedAt: '2026-03-29T22:30:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9596'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-29T22:30:03Z'
---
# Fix SSG Pipeline Concurrency Hanging and Suppress Component Error Noise

**Description**
The SSG pipeline experienced two critical issues during full site generation (3701 routes):
1. **Intense JS Error Noise:** Buggy component logic or unmocked XHR requests caused noisy trace outputs (e.g. `Pipeline: IPC error`, `TypeError` via `SsrService` hydration) polluting the build logs.
2. **Concurrency Freeze:** The SSG `runRendererProcess` workers kept NodeJS event loops alive indefinitely due to internal Neo framework background loops, causing `Promise.all` inside `build.mjs` batch processing to hang.

**Resolution**
- Wrap `hasError` handling in `ssrRenderer.mjs` to bypass `originalConsoleError` tracing.
- Force explicitly exit via `process.exit(0)` when `fs.writeFile` completes successfully inside the SSR worker child process.

## Timeline

- 2026-03-29T22:29:24Z @tobiu added the `bug` label
- 2026-03-29T22:29:24Z @tobiu added the `ai` label
### @tobiu - 2026-03-29T22:30:03Z

Closed: Created in wrong repository.

- 2026-03-29T22:30:03Z @tobiu closed this issue

