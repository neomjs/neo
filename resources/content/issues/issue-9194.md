---
id: 9194
title: Zero Overhead Record Architecture & Grid Dynamic Column Fixes
state: OPEN
labels:
  - epic
  - ai
  - architecture
  - performance
  - core
assignees:
  - tobiu
createdAt: '2026-02-17T13:35:23Z'
updatedAt: '2026-02-17T13:38:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9194'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9193 Implement Virtual Fields for Zero-Overhead Records'
  - '[x] 9195 Fix GridBody Column Position Sync on DataField Change'
  - '[x] 9197 Add Regression Test for Dynamic Grid Columns'
  - '[x] 9198 Cleanup Redundant GridContainer Logic'
  - '[ ] 9199 Benchmark Grid Horizontal Scroll Performance'
  - '[x] 9201 Docs: Dynamic Grids Guide'
subIssuesCompleted: 5
subIssuesTotal: 6
blockedBy: []
blocking: []
---
# Zero Overhead Record Architecture & Grid Dynamic Column Fixes

This Epic encapsulates the architectural shift to "Zero Overhead" records using virtual fields and the necessary fixes to the Grid component to support dynamic column remapping at runtime.

### Strategic Goal
To achieve a flat memory profile for `Neo.data.Record` instances even with hundreds of calculated fields (e.g., yearly stats), while ensuring the `Neo.grid.Container` can robustly handle dynamic `dataField` changes without breaking virtual scrolling.

### Scope
1.  **Core Architecture**: Implement `virtual: true` in `RecordFactory` to generate prototype-based getters instead of instance properties.
2.  **Model Refactoring**: Update `DevIndex.model.Contributor` to utilize virtual fields for O(1) access to raw data arrays.
3.  **Grid Stability**: Fix regressions in `Neo.grid.Body` where dynamic changes to column `dataField`s cause desynchronization in `columnPositions` and row recycling maps, leading to rendering artifacts during horizontal scroll.
4.  **Verification**: Implement reproduction test cases to validate the fix and ensure no future regressions.

### Roadmap
- [ ] #9193 Implement Virtual Fields in RecordFactory & Update Model
- [ ] Fix GridBody Column Position Sync on DataField Change (To be created)
- [ ] Create Reproduction Test Case for Dynamic Grid Columns (To be created)

## Timeline

- 2026-02-17T13:35:25Z @tobiu added the `epic` label
- 2026-02-17T13:35:25Z @tobiu added the `ai` label
- 2026-02-17T13:35:25Z @tobiu added the `architecture` label
- 2026-02-17T13:35:25Z @tobiu added the `performance` label
- 2026-02-17T13:35:25Z @tobiu added the `core` label
- 2026-02-17T13:35:37Z @tobiu added sub-issue #9193
- 2026-02-17T13:36:18Z @tobiu added sub-issue #9195
- 2026-02-17T13:38:47Z @tobiu assigned to @tobiu
- 2026-02-17T13:40:37Z @tobiu cross-referenced by #9193
- 2026-02-17T14:18:58Z @tobiu added sub-issue #9197
- 2026-02-17T14:20:31Z @tobiu added sub-issue #9198
- 2026-02-17T14:33:53Z @tobiu added sub-issue #9199
- 2026-02-17T15:13:23Z @tobiu added sub-issue #9201

