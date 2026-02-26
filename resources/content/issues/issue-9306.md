---
id: 9306
title: Implement two-state (ASC/DESC) sorting for Grid headers
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-26T13:12:04Z'
updatedAt: '2026-02-26T13:16:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9306'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-26T13:16:40Z'
---
# Implement two-state (ASC/DESC) sorting for Grid headers

**Problem:**
Currently, Neo.mjs grid header buttons use tri-state sorting (ASC, DESC, null). This was originally designed to allow reverting to an unsorted state and testing `collection.allItems`. However, for most real-world use cases (like the DevIndex grid), a two-state sorting mechanism (ASC, DESC) is more intuitive and expected by users.

**Proposed Solution:**
Introduce a new reactive configuration, `useTriStateSorting_`, on grid components. This config should default to `false` (enabling two-state sorting by default) and propagate from the `GridContainer` down to the `HeaderToolbar` and finally to the individual `HeaderButton`s.

- **`src/grid/header/Button.mjs`**: Add `useTriStateSorting_: false` and update `onClick` to bypass the `null` state based on this config.
- **`src/grid/header/Toolbar.mjs`**: Add `useTriStateSorting_: false` to propagate the setting to its child buttons and respond to dynamic changes.
- **`src/grid/Container.mjs`**: Expose `useTriStateSorting_: false` to provide a top-level developer API to configure sorting behavior for the entire grid.

## Timeline

- 2026-02-26T13:12:05Z @tobiu added the `enhancement` label
- 2026-02-26T13:12:05Z @tobiu added the `ai` label
- 2026-02-26T13:15:41Z @tobiu referenced in commit `915a2c9` - "feat(grid): Implement two-state (ASC/DESC) sorting for Grid headers (#9306)"
### @tobiu - 2026-02-26T13:15:59Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the `useTriStateSorting_: false` configuration across the `GridContainer`, `HeaderToolbar`, and `HeaderButton` components to enable two-state sorting (ASC/DESC) by default. The changes have been pushed to the `dev` branch.

- 2026-02-26T13:16:25Z @tobiu assigned to @tobiu
- 2026-02-26T13:16:40Z @tobiu closed this issue

