---
id: 9819
title: 'R&D: Identify Ideal Candidates for Whitebox E2E Testing'
state: OPEN
labels:
  - enhancement
  - ai
  - testing
assignees: []
createdAt: '2026-04-09T11:33:45Z'
updatedAt: '2026-04-09T13:51:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9819'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[x] 8851 Exploration: Neural Link Driven Playwright Tests (Deep E2E)'
---
# R&D: Identify Ideal Candidates for Whitebox E2E Testing

### Background
The initial integration of Neural Link with Playwright for whitebox E2E testing attempted to use the `DevIndex` application, driving mutations into complex grid layouts (like modifying a grid header button's width directly). This highlighted that monolithic, highly state-managed applications are tough first targets for proving Neural Link's baseline test primitives.

### Objective
- Identify the most minimal, stable Neo.mjs applications or standalone components (e.g., specific `examples/` apps) that are ideal candidates for initial Neural Link test integration.
- Prove the test architecture on basic inputs/outputs (like standalone generic buttons or primitive windows) prior to moving testing over to nested container layouts.

## Timeline

- 2026-04-09T11:33:46Z @tobiu added the `enhancement` label
- 2026-04-09T11:33:46Z @tobiu added the `ai` label
- 2026-04-09T11:33:46Z @tobiu added the `testing` label
- 2026-04-09T11:34:01Z @tobiu marked this issue as blocking #8851
### @m13v - 2026-04-09T13:49:40Z

starting with the simplest standalone components is the right instinct. we went through a similar exercise trying to find good first targets for automated E2E test generation and the pattern that emerged: components with clear input/output contracts and minimal external state are ideal. things like a standalone button with click handlers, a simple dialog with open/close state, or a basic form with validation. the grid was probably a rough first target because it has too much internal state management and inter-column dependencies. for Neo specifically, the examples/ directory apps that use a single component in isolation would be the lowest risk starting point. once you have the test primitives proven on those, composing them for more complex layouts becomes much more predictable.

### @m13v - 2026-04-09T13:51:07Z

we built an open source tool that auto-discovers testable components by crawling the running app. the discovery and scenario generation logic: https://github.com/assrt-ai/assrt-freestyle/blob/main/src/core/freestyle.ts. it identifies interactive elements and generates Playwright tests for each one automatically, which is essentially the inverse of your problem (finding what to test).


