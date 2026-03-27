---
id: 9499
title: 'Grid Multi-Body: Test Suite Refactoring & Expansion'
state: OPEN
labels:
  - epic
  - ai
  - testing
  - grid
assignees:
  - tobiu
createdAt: '2026-03-16T22:29:02Z'
updatedAt: '2026-03-17T18:59:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9499'
author: tobiu
commentsCount: 0
parentIssue: 9486
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Grid Multi-Body: Test Suite Refactoring & Expansion

Phase 8 of the Multi-Body Epic (#9486).

The fundamental shift from a Single-Body to a Multi-Body architecture breaks the core assumptions of our existing test suite. A "Row" is no longer a single physical DOM node, and a "Grid" is no longer a single scrollable container.

Before marking the Epic as complete, the entire Playwright test suite must be refactored to assert against the new structural reality, and new tests must be written to cover the advanced orchestration.

**1. Existing Test Refactoring:**
The following test suites rely heavily on DOM structure and event targeting that will change. They must be updated:
*   \`test/playwright/unit/grid/column/Component.spec.mjs\` (Ensure component columns render correctly inside split SubGrids and preserve state).
*   \`test/playwright/unit/grid/DynamicColumn.spec.mjs\` (Adding/removing columns must correctly route them to the appropriate SubGrid collection).
*   \`test/playwright/unit/grid/LockedColumns.spec.mjs\` (The definition of "locked" changes from a CSS \`transform\` to a physical \`SubGrid\` boundary. Assertions must reflect this).
*   \`test/playwright/unit/grid/Pooling.spec.mjs\` (Row pooling is now isolated per SubGrid. Must assert that scrolling reuses nodes within their respective zones).
*   \`test/playwright/unit/grid/PoolingRuntimeUpdates.spec.mjs\` (Ensure record updates trigger VDOM changes across all active physical row representations).
*   \`test/playwright/unit/grid/StoreInteractions.spec.mjs\` (Sorting/Filtering must update all active SubGrids simultaneously).
*   \`test/playwright/unit/grid/Teleportation.spec.mjs\` (Ensure the "Surgical DOM Move" for drag proxies still works when crossing SubGrid boundaries).

**2. New Test Coverage Requirements:**
*   **Orchestration Tests:** Verify that \`GridContainer\` correctly splits a flat \`columns\` array into \`start\`, \`center\`, and \`end\` collections.
*   **Sync Scrolling:** Assert that horizontal scrolling via the decoupled \`HorizontalScroller\` correctly updates the Center SubGrid's body and header.
*   **Selection Synchronization:** Assert that clicking a row in the Left SubGrid visually selects the corresponding rows in the Center and Right SubGrids.
*   *(Note: Cross-window Drag & Drop testing may require future Playwright SDK enhancements related to the Neural Link).*

## Timeline

- 2026-03-16T22:29:03Z @tobiu added the `epic` label
- 2026-03-16T22:29:03Z @tobiu added the `ai` label
- 2026-03-16T22:29:03Z @tobiu added the `testing` label
- 2026-03-16T22:29:03Z @tobiu added the `grid` label
- 2026-03-16T22:29:29Z @tobiu added parent issue #9486
- 2026-03-17T18:59:58Z @tobiu assigned to @tobiu

