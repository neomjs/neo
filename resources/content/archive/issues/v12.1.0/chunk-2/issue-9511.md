---
id: 9511
title: '[Epic] Grid Value Banding'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
  - grid
assignees:
  - tobiu
createdAt: '2026-03-18T14:15:31Z'
updatedAt: '2026-03-18T14:18:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9511'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 9512 Dynamic Value Banding Updates'
  - '[x] 9513 Optimize Grid Value Banding (startIndex Support)'
  - '[x] 9514 [Epic Sub] TreeStore Value Banding Support'
  - '[x] 9515 [Epic Sub] Value Banding styling conflicts with row selection'
subIssuesCompleted: 4
subIssuesTotal: 4
blockedBy: []
blocking: []
closedAt: '2026-03-18T14:18:17Z'
---
# [Epic] Grid Value Banding

Implement a "value banding" effect for grid columns. This gives cells in a specific column with the same contiguous value the same background color.
It requires updating the collection, store, grid container, and grid columns to propagate and compute this state.

Key architecture:
- `collection.Base` maintains a `valueBandsMap` Map instance (keyed by recordId) to prevent V8 hidden class de-optimizations on the `Record` instances or raw data objects.
- `grid.Row` queries `store.valueBandsMap` during `applyRendererOutput` to inject `neo-value-band-1` or `neo-value-band-2` CSS classes.
- `grid.Container` supports `body: { stripedRows: false }` to disable alternating row colors which clash with value banding.
- An example app is added to `examples/grid/valueBanding`.
- Proper test suites are implemented in `test/playwright/unit/collection/ValueBanding.spec.mjs` and `test/playwright/unit/data/StoreValueBandingCount.spec.mjs` to ensure the recalculation algorithm only evaluates linearly on fields and efficiently updates state.

Sub-tasks:
- [x] Add `valueBandingFields` and `calcValueBands` to `collection.Base`
- [x] Update `grid/Container` and `grid/Row` to render the correct CSS classes (`neo-value-band-1`, `neo-value-band-2`)
- [x] Create SCSS variables for themes
- [x] Add `stripedRows` config to `grid.Body`
- [x] Add unit test for collection and store value banding
- [x] Create an example app `examples/grid/valueBanding`

## Timeline

- 2026-03-18T14:15:33Z @tobiu added the `enhancement` label
- 2026-03-18T14:15:33Z @tobiu added the `epic` label
- 2026-03-18T14:15:34Z @tobiu added the `ai` label
- 2026-03-18T14:15:34Z @tobiu added the `grid` label
- 2026-03-18T14:17:27Z @tobiu referenced in commit `f038194` - "feat(grid): Implement value banding for grid columns (#9511)"
- 2026-03-18T14:17:37Z @tobiu assigned to @tobiu
### @tobiu - 2026-03-18T14:18:05Z

Implemented via f0381948e

- 2026-03-18T14:18:17Z @tobiu closed this issue
### @tobiu - 2026-03-18T14:18:38Z

<img width="1091" height="414" alt="Image" src="https://github.com/user-attachments/assets/6fbd1ff0-d45d-4987-aa45-cb1c72a35079" />

- 2026-03-18T14:43:46Z @tobiu cross-referenced by #9512
- 2026-03-18T14:45:00Z @tobiu added sub-issue #9512
- 2026-03-18T15:03:53Z @tobiu cross-referenced by #9513
- 2026-03-18T15:04:27Z @tobiu added sub-issue #9513
- 2026-03-18T15:07:50Z @tobiu cross-referenced by #9514
- 2026-03-18T15:08:12Z @tobiu added sub-issue #9514
- 2026-03-18T18:21:20Z @tobiu cross-referenced by #9515
- 2026-03-18T18:21:35Z @tobiu added sub-issue #9515

