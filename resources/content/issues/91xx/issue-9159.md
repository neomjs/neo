---
id: 9159
title: 'regression: Component Columns trigger insertNode operations during scrolling'
state: OPEN
labels:
  - bug
  - ai
  - regression
  - performance
assignees:
  - tobiu
createdAt: '2026-02-15T00:45:23Z'
updatedAt: '2026-02-15T00:59:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9159'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# regression: Component Columns trigger insertNode operations during scrolling

During grid scrolling, we observed `insertNode` operations for `Neo.component.CountryFlag` and `Neo.component.GitHubOrgs` components.
This indicates a potential failure in component recycling or a VDOM diffing issue where the framework believes it needs to re-mount these components instead of reusing them.

**Observed Behavior:**
-   `insertNode` deltas appearing in logs for component columns.
-   Affects `CountryFlag` and `GitHubOrgs` specifically.

**Expected Behavior:**
-   **Zero Structural Deltas:** Grid scrolling should rely **exclusively** on attribute updates (content, style, `translate3d`).
-   **No Move/Insert/Remove:** The "Fixed-DOM-Order" strategy ensures the DOM structure remains stable. Any `moveNode`, `insertNode`, or `removeNode` operation during scrolling is considered a regression/failure of the recycling logic.
-   Component columns should be recycled in-place via `updateContent`.

**Investigation Areas:**
-   `src/grid/column/Component.mjs`
-   `src/component/CountryFlag.mjs`
-   `src/component/GitHubOrgs.mjs`
-   `src/main/DeltaUpdates.mjs`
-   Verify if `createVdom` correctly returns the recycled component reference vs a new VDOM object.

## Timeline

- 2026-02-15T00:45:24Z @tobiu added the `bug` label
- 2026-02-15T00:45:24Z @tobiu added the `ai` label
- 2026-02-15T00:45:24Z @tobiu added the `regression` label
- 2026-02-15T00:45:24Z @tobiu added the `performance` label
- 2026-02-15T00:59:14Z @tobiu assigned to @tobiu

