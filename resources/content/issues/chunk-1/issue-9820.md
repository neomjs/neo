---
id: 9820
title: 'R&D: Grid Component Mutability & Column Synchronization'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - grid
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2026-04-09T11:33:52Z'
updatedAt: '2026-06-23T03:10:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9820'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking:
  - '[x] 8851 Exploration: Neural Link Driven Playwright Tests (Deep E2E)'
---
# R&D: Grid Component Mutability & Column Synchronization

### Background
During whitebox E2E testing, we discovered that explicitly mutating a Grid Header Button's `width` via Neural Link successfully updates the resulting VNode component state, but fails to update the physical layout because the wider grid `columns` collection and flex layouts override the child node's inline specification.

### Objective
- Research whether targeting and altering raw child grid components (e.g. `header.Button`) should technically ripple up and update structural `columns` or `columnPositions`, adjusting the container's layout metrics.
- Should this be disallowed semantically (requiring column mutations to go through grid container methods natively)? Outline the expected domain boundary for E2E testing.

## Timeline

- 2026-04-09T11:33:53Z @tobiu added the `enhancement` label
- 2026-04-09T11:33:54Z @tobiu added the `ai` label
- 2026-04-09T11:33:54Z @tobiu added the `architecture` label
- 2026-04-09T11:33:54Z @tobiu added the `grid` label
- 2026-04-09T11:34:02Z @tobiu marked this issue as blocking #8851
- 2026-06-08T21:57:30Z @neo-opus-ada assigned to @neo-opus-ada
- 2026-06-11T01:18:10Z @neo-opus-ada unassigned from @neo-opus-ada
- 2026-06-15T16:04:28Z @neo-gpt cross-referenced by #13362
- 2026-06-23T03:09:59Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:09:59Z @neo-gpt added the `needs-design` label
### @neo-gpt - 2026-06-23T03:10:13Z

[ARCH_ALIGNMENT]

Intake classification from the 2026-06-23 lane-pickup sweep: **not-code-ready / needs-design**, not a direct implementation pickup.

Evidence checked:

- Live #9820 body is explicitly an R&D/domain-boundary question: should direct Neural Link mutation of a raw child `grid.header.Button.width` ripple into structural grid columns / `columnPositions`, or should tests mutate columns through grid/container APIs only?
- Current source shows the structural width path is already domain-specific:
  - `src/grid/header/plugin/Resizable.mjs` updates `owner.width`, calls `body.updateCellPositions(...)` during drag, and calls `toolbar.passSizeToBody()` on drag end.
  - `src/grid/header/Toolbar.mjs#passSizeToBody()` derives `columnPositions` and `availableWidth` from header items / DOM rects and writes them into the body.
  - `src/grid/Body.mjs#updateCellPositions()` updates cached column positions, available width, row cell widths, and following-cell offsets.
  - `src/grid/column/Base.mjs` already treats column-level changes such as `dataField` / `locked` as structural grid changes.
- Current whitebox coverage still contains the raw-mutation pattern in `test/playwright/e2e/GridSelectionMultiBody.spec.mjs` (`app.setProperties(firstCenterCellId, {width: newWidth})`), but that proves only component-local VDOM/CSS mutation. It does not settle whether this should be the supported grid column-resize contract.
- KB confirms #9820 blocks the older whitebox-E2E exploration line (#8851) and is still open as the boundary decision. Memory Core raw query returned no relevant prior-session hits.
- PR sweep found adjacent later grid whitebox work (#12893), but no merged PR that resolves this specific domain-boundary question.

Verdict: keep the issue open as a design boundary, but exclude it from direct code pickup. A claimable follow-up should first decide and document the contract. My current evidence points toward: **raw `set_instance_properties` stays component-local; structural column-width changes should go through an explicit grid/column API or a dedicated Neural Link semantic tool, not implicit upward ripple from arbitrary child mutation.** Once that contract is accepted, the implementation leaf can update tests/tools accordingly.


