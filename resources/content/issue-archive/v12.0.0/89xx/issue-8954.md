---
id: 8954
title: 'Feat: Generic Sparkline Component & Grid Column'
state: CLOSED
labels:
  - enhancement
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-02T22:20:31Z'
updatedAt: '2026-02-02T22:39:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8954'
author: tobiu
commentsCount: 1
parentIssue: 8948
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-02T22:39:16Z'
---
# Feat: Generic Sparkline Component & Grid Column

## Goal
Promote the `DevRank.view.SparklineComponent` implementation to a generic framework component (`Neo.component.Sparkline`) and create a corresponding grid column (`Neo.grid.column.Sparkline`) to enable widespread usage.

## Scope
1.  **Create `src/component/Sparkline.mjs`:**
    -   Extend `Neo.component.Canvas`.
    -   Port the controller logic from `apps/devrank/view/SparklineComponent.mjs`.
    -   Ensure the renderer connection is configurable.
    -   Update class names to be generic (e.g., `neo-sparkline-canvas`).
2.  **Create `src/grid/column/Sparkline.mjs`:**
    -   Extend `Neo.grid.column.Component`.
    -   Implement `applyRecordConfigs` to map record data fields to the component.
    -   Set `Neo.component.Sparkline` as the default module.
3.  **Create `resources/scss/src/grid/column/Sparkline.scss`:**
    -   Extract sparkline-specific styles from `resources/scss/src/apps/devrank/GridContainer.scss`.
    -   Rename classes to match the generic component (e.g., `.neo-sparkline-wrapper`).
4.  **Export:**
    -   Add `Neo.grid.column.Sparkline` to `src/grid/column/_export.mjs`.

## Note
-   The Canvas worker renderer (`apps/devrank/canvas/Sparkline.mjs`) will be moved in a separate step.

## Timeline

- 2026-02-02T22:20:32Z @tobiu added the `enhancement` label
- 2026-02-02T22:20:33Z @tobiu added the `ai` label
- 2026-02-02T22:20:33Z @tobiu added the `feature` label
- 2026-02-02T22:38:32Z @tobiu referenced in commit `e2907a5` - "feat: Generic Sparkline Component & Grid Column (#8954)"
- 2026-02-02T22:38:40Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-02T22:38:50Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully implemented the generic Sparkline component and grid column.
> 
> **Changes:**
> 1.  **Promoted Component:** `DevRank.view.SparklineComponent` has been genericized and moved to `src/component/Sparkline.mjs`. It now supports top-level configuration for dynamic worker renderers (`rendererClassName`, `rendererImportPath`).
> 2.  **New Grid Column:** Created `src/grid/column/Sparkline.mjs`. This column type automatically maps record data to the component's `values` and passes down renderer configurations from the column definition to the component defaults.
> 3.  **SCSS Extraction:** Styles were extracted to `resources/scss/src/grid/column/Sparkline.scss`, making the component stylistically independent.
> 4.  **Integration:** `DevRank.view.GridContainer` was updated to use the new `type: 'sparkline'` column. The data aggregation logic remains in the `component` function, while the renderer configuration was moved to the column definition for clarity.
> 5.  **Cleanup:** Deleted the obsolete `apps/devrank/view/SparklineComponent.mjs`.
> 
> The implementation allows for easy reuse of worker-based sparklines across the framework while maintaining the "Zero-Config" goal for standard usage.

- 2026-02-02T22:39:02Z @tobiu added parent issue #8948
- 2026-02-02T22:39:16Z @tobiu closed this issue
- 2026-02-02T22:54:38Z @tobiu cross-referenced by #8948

