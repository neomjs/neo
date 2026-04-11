---
id: 9868
title: 'R&D: Grid Multi-Body Selection Architecture Redesign'
state: CLOSED
labels:
  - epic
  - ai
assignees: []
createdAt: '2026-04-10T16:35:09Z'
updatedAt: '2026-04-10T18:19:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9868'
author: tobiu
commentsCount: 1
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9492 Grid Multi-Body: Adapt Selection Models for Split Rows'
closedAt: '2026-04-10T18:19:48Z'
---
# R&D: Grid Multi-Body Selection Architecture Redesign

This R&D ticket is established to redefine the Neo.mjs Grid Multi-Body Selection Architecture, acting as an architectural blocker for the tactical implementation in issue #9492. 

The findings below are derived from a derailed agent session retro and mandate a step back to draft a new State Topology before further code is written.

---

# Retrospective & Architectural Blockers: Epic #9492 (Grid Multi-Body Synchronization)

## 1. Where Are We At?

The repository is currently in a state with incomplete, "tactical" modifications applied to the `Neo.selection.grid.BaseModel`. Both key E2E test validations in `GridSelectionMultiBody.spec.mjs` remain failing.

**Current Architectural State:**
- **Grid Container:** `GridContainer` clones `selectionModel` instances to `body`, `bodyStart`, and `bodyEnd` without `ignoreNeoInstances: true`, meaning each body has an instantiated model.
- **BaseModel / Row Selection (`neo-selected` failure):** Attempted to implement `row.updateContent({force: true})` within the selection flow instead of raw VDOM mutation. However, because tests interact with the top-level `GridContainer`'s `selectionModel` (not a specific `GridBody`), the `getActivePeers()` method logic fails to identify the child body selection models. Thus, row states are not syncing because the centralized and distributed states are disconnected.
- **Column Width Updation (`2050px` failure):** Attempting to resize a column via `app.setProperties(headerCell, {width})` fails. `neo-mjs` Grid utilizes `CSS Grid Template` properties on the parent containers (`GridContainer` / `GridBody`) to size cells, not direct inline styles on the header components.

## 2. What Went Wrong?

1. **Tunnel Vision & "Whack-A-Mole" Execution:** Tactical, immediate symptom fixing (a failing Playwright test) overrode structural awareness. 
2. **Ignoring Explicit Direction:** Bypassed planning mode and dove into iterative, brute-force debugging instead of moving `selectionModel_` fully into `GridContainer` natively.
3. **Misinterpreting E2E Data:** Silent failures inside the App Worker (due to incorrect peer proxies) were masked by external E2E test timeouts.

## 3. The Path Forward (Requirements for this R&D Ticket)

Before tactical coding resumes on #9492, we MUST:
1. Use the `ideation-sandbox` to draft a State Flow Diagram mapping how `selectionModel` state propagates top-down versus peer-to-peer.
2. Architect how `GridContainer` can become the **absolute single source of truth** for selections, potentially replacing `Peer State Adoption` with a top-down `Container -> Body -> Row` flow.
3. Validate this new architecture mathematically using Neural Link VDOM tools (`inspect_component_render_tree`) rather than relying on external E2E runner sweeps.

## Timeline

- 2026-04-10T16:35:10Z @tobiu added the `epic` label
- 2026-04-10T16:35:11Z @tobiu added the `ai` label
- 2026-04-10T16:35:19Z @tobiu added parent issue #9486
- 2026-04-10T16:35:22Z @tobiu marked this issue as blocking #9492
### @tobiu - 2026-04-10T18:19:47Z

Closing R&D ticket. Work transitioned to #9872 and #9492.

- 2026-04-10T18:19:48Z @tobiu closed this issue

