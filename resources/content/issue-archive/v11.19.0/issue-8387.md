---
id: 8387
title: Refactor Portal TabContainers to use Shared Base Class and Styling
state: CLOSED
labels:
  - design
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-07T15:07:58Z'
updatedAt: '2026-01-07T15:11:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8387'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-07T15:10:56Z'
---
# Refactor Portal TabContainers to use Shared Base Class and Styling

To ensure consistent styling between the Examples and News sections of the Portal, we are refactoring them to share a common base class and SCSS file.

**Changes:**
1.  **Shared Base Class:** Create `apps/portal/view/shared/TabContainer.mjs`.
    *   Extend `Neo.tab.Container`.
    *   Use `baseCls: ['portal-shared-tab-container', 'neo-tab-container']` (changed from `cls` to `baseCls`).
    *   Set `tabBarPosition: 'left'`.
2.  **Shared SCSS:** Move `examples/TabContainer.scss` to `shared/TabContainer.scss` and update selectors to `.portal-shared-tab-container`.
3.  **Refactor Subclasses:**
    *   Update `Portal.view.examples.TabContainer` to extend the shared class.
    *   Update `Portal.view.news.TabContainer` to extend the shared class.
    *   Remove `tabBarPosition: 'left'` and `baseCls`/`cls` from subclasses as they are inherited.
    *   Update `headerToolbar` configs in subclasses to use the shared styling class `.portal-shared-tab-header-toolbar`.

## Timeline

- 2026-01-07T15:07:59Z @tobiu added the `design` label
- 2026-01-07T15:07:59Z @tobiu added the `ai` label
- 2026-01-07T15:07:59Z @tobiu added the `refactoring` label
- 2026-01-07T15:10:33Z @tobiu referenced in commit `5909075` - "refactor(portal): implement shared TabContainer base class and styling #8387"
### @tobiu - 2026-01-07T15:10:41Z

**Input from Gemini 3 Pro:**

> ✦ Refactoring complete.
> - Created `apps/portal/view/shared/TabContainer.mjs` as the base class.
> - Moved and updated SCSS to `resources/scss/src/apps/portal/shared/TabContainer.scss`.
> - Updated `Examples` and `News` tab containers to extend the shared class.

- 2026-01-07T15:10:56Z @tobiu closed this issue
- 2026-01-07T15:11:09Z @tobiu assigned to @tobiu

