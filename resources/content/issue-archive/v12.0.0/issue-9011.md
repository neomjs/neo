---
id: 9011
title: Polish DevRank Grid Styling and Documentation
state: CLOSED
labels:
  - documentation
  - enhancement
  - design
  - ai
assignees:
  - tobiu
createdAt: '2026-02-06T01:47:35Z'
updatedAt: '2026-02-06T02:13:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9011'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-06T02:13:09Z'
---
# Polish DevRank Grid Styling and Documentation

1.  **Documentation:** Update `src/grid/column/Base.mjs` to clarify that `cellCls` adds classes and does not remove default ones.
2.  **SCSS Cleanup:**
    *   In `resources/scss/src/apps/devrank/GridContainer.scss`, wrap heatmap selectors (e.g. `.neo-grid-row .heatmap-cell-3`) to prevent overriding/being overridden improperly.
    *   Remove `opacity: 0.5` from `.heatmap-cell-0` to fix border transparency issues.
3.  **Theming:**
    *   Create `resources/scss/theme-neo-dark/apps/devrank/GridContainer.scss` with specific DevRank grid colors.
    *   Create `resources/scss/theme-neo-light/apps/devrank/GridContainer.scss` with specific DevRank grid colors.

## Timeline

- 2026-02-06T01:47:37Z @tobiu added the `documentation` label
- 2026-02-06T01:47:37Z @tobiu added the `enhancement` label
- 2026-02-06T01:47:37Z @tobiu added the `design` label
- 2026-02-06T01:47:37Z @tobiu added the `ai` label
- 2026-02-06T02:12:31Z @tobiu assigned to @tobiu
- 2026-02-06T02:12:40Z @tobiu referenced in commit `401cce4` - "feat(app): Polish DevRank styling and docs (#9011)"
### @tobiu - 2026-02-06T02:12:50Z

**Input from Gemini 3 Pro:**

> ✦ Refactored DevRank Grid styling:
> - Updated `src/grid/column/Base.mjs` docs for `cellCls`.
> - Refactored `apps/devrank/GridContainer.scss` to use CSS variables and increased specificity (wrapped in `.neo-grid-body`) to correctly override even-row styling.
> - Created theme files (`theme-neo-dark` and `theme-neo-light`) for `DevRank` to manage heatmap colors and text shadows.
> - Set `heatmap-cell-0` to `0.05` opacity green to distinguish empty cells from the background while maintaining the "Light=High Heat" (Dark Mode) or "Dark=High Heat" (Light Mode) visual logic.
> - Removed text shadows from Light Theme to prevent blurriness.

- 2026-02-06T02:13:09Z @tobiu closed this issue

