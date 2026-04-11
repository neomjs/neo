---
id: 9872
title: 'Grid Multi-Body: 3-Tier Component Orchestration and Architecture Refactoring'
state: OPEN
labels:
  - enhancement
  - ai
  - grid
assignees: []
createdAt: '2026-04-10T18:19:24Z'
updatedAt: '2026-04-10T18:19:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9872'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: 3-Tier Component Orchestration and Architecture Refactoring

### The Problem: The \"God Object\" Pattern
Currently, `Neo.grid.Container` carries the burden of manually instantiating `headerStart`, `bodyStart`, and related split components. It forcibly injects them into the view hierarchy and manages low-level column iteration parameters. This violates the Single Responsibility Principle, creates immense VDOM diff penalties across unrelated domains (especially for Selection Models), and creates brittle `this.items` synchronization.

### The Solution: The 3-Tier Orchestration Architecture
To support the Multi-Body split cleanly and prepare the foundation for centralized Selection Models (unblocking #9492), the instantiation logic must be pushed downwards:

1. **`Neo.grid.Container` (Macro Routing):**
   - Stripped down into a pure macro layout coordinator.
   - Distributes columns parameters downwards but drops manual SubGrid instantiation from `createOrUpdateSubGrids()`.

2. **`Neo.grid.header.Wrapper` (New Orchestrator):**
   - A dedicated wrapper (upgraded from a generic `BaseContainer`) that is strictly responsible for managing `headerStart`, `headerToolbar`, and `headerEnd`.

3. **`Neo.grid.View` (The State Master):**
   - Transitioned into the master body orchestrator.
   - Strictly responsible for the creation, lifecycle, and row-synchronization (`syncBodies`) of `bodyStart`, `body`, and `bodyEnd`.

### Architectural Guarantee
This isolates all physical row logic perfectly beneath `grid.View`, enabling it to safely host the `SelectionModel` in the future without triggering header layout thrashing.

## Timeline

- 2026-04-10T18:19:26Z @tobiu added the `enhancement` label
- 2026-04-10T18:19:26Z @tobiu added the `ai` label
- 2026-04-10T18:19:26Z @tobiu added the `grid` label
- 2026-04-10T18:19:43Z @tobiu added parent issue #9486
- 2026-04-10T18:19:48Z @tobiu cross-referenced by #9868

