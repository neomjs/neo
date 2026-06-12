---
id: 9819
title: 'R&D: Identify Ideal Candidates for Whitebox E2E Testing'
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-09T11:33:45Z'
updatedAt: '2026-04-09T17:17:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9819'
author: tobiu
commentsCount: 6
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[x] 8851 Exploration: Neural Link Driven Playwright Tests (Deep E2E)'
closedAt: '2026-04-09T15:30:38Z'
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

### @tobiu - 2026-04-09T14:46:33Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ @m13v Thank you for the insights and sharing the `assrt-freestyle` tool! 
> 
> To clarify our architectural objective here: whitebox E2E testing based on the Neo.mjs Neural Link (a bridge for multiple agents and app workers) is quite something different from traditional DOM-crawling automation.
> 
> Because Neo.mjs executes the entirety of the component configurations and data processing within a separate App Worker (maintaining the DOM purely as a remote view), the single source of truth for the application state exists entirely within the Worker's memory space.
> 
> The Neural Link allows Playwright tests to query this Worker directly in real-time (e.g. `await app.getStore('my-store').count`) to assert internal properties, entirely bypassing the brittle and slow process of querying DOM locators. Instead of testing *what* is painted, we are testing the *actual state* generating it. We are starting with standalone components primarily to harden these low-level socket primitives before unleashing them on the complex Multi-Body Grid layouts.

- 2026-04-09T15:24:28Z @tobiu referenced in commit `5a00bce` - "test: Implement comprehensive Neural Link validation for component primitives and configuration interactions (#9819)"
- 2026-04-09T15:24:39Z @tobiu assigned to @tobiu
- 2026-04-09T15:26:59Z @tobiu cross-referenced by #9826
### @tobiu - 2026-04-09T15:30:36Z

Based on recent baseline validations and a structural review of the `examples/grid` workspace, jumping strictly from standalone primitives to a monolithic app like DevIndex was the root cause of the previous context implosions.

**Architectural Escalation Path for Neural Link E2E:**

To establish robust Neural Link capabilities for the Grid Multi-Body architecture, we should follow this strict testing gradient:

1. **Level 1 (Primitives)**: `examples/button/base` (✅ Validated via #9826 - Proved direct state inspection and semantic querying).
2. **Level 2 (Single-Body Datastore)**: `examples/grid/basic`
   * *Goal:* Validate `Store` inspection, record-level mutation tracking, and simple header manipulations.
3. **Level 3 (High-Density / Virtualization)**: `examples/grid/bigData`
   * *Goal:* `bigData` offers a massive virtualized grid but with an isolated, clean controller structure (`ControlsContainer.mjs` -> `GridContainer.mjs`). It is ideal for testing Neural Link's structural footprint (`getComponentTree` limits) and layout-thrashing validation without unrelated app-level noise.
4. **Level 4 (Interactive Grid States)**: `examples/grid/cellEditing`
   * *Goal:* Validate transient inputs inside a layout (e.g., intercepting dynamic inline textfield mounts via Neural Link).
5. **Level 5 (Monolithic Orchestration)**: The `DevIndex` application.
   * *Goal:* Multi-app level layout synchronization and God Mode modifications.

**Recommendation:**
This identification fulfills the objective. Our next actionable ticket should be implementing the test suite for `examples/grid/bigData` to harden the Neural Link for data-bound grid layouts.

- 2026-04-09T15:30:38Z @tobiu closed this issue
- 2026-04-09T15:35:23Z @tobiu cross-referenced by #9827
### @m13v - 2026-04-09T17:16:36Z

The distinction between worker-thread whitebox testing and DOM-crawling automation is an important one. If Neo.mjs keeps component state entirely in the App Worker, then testing through the Neural Link bridge gives you direct access to the actual data model without fighting DOM synchronization. That's fundamentally more reliable than traditional E2E. The architectural difference makes this a different category of testing entirely.

### @m13v - 2026-04-09T17:17:09Z

The gradient from primitives to composites to multi-body grid is a solid methodology. Validating each level before escalating prevents the context implosion you described. The button baseline from #9826 gives you a known-good reference point. For the grid level, I'd suggest testing with a small fixed dataset first (3x3 grid, known values) before scaling to dynamic data, so you can isolate rendering issues from data-binding issues.


