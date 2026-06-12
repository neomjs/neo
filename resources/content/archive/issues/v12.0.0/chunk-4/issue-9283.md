---
id: 9283
title: 'Canvas Sparkline: React to theme changes'
state: CLOSED
labels:
  - bug
  - ai
  - core
assignees:
  - tobiu
createdAt: '2026-02-24T02:20:02Z'
updatedAt: '2026-02-24T02:21:04Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9283'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-24T02:21:04Z'
---
# Canvas Sparkline: React to theme changes

The Sparkline canvas widget does not update its colors when the global application theme changes (e.g., to dark mode) because the `theme` config is only passed on initial registration, but `updateConfig` in the worker does not handle it dynamically.

**Resolution:**
- Updated `updateConfig` in `src/canvas/Sparkline.mjs` to apply `theme` changes and trigger a redraw.
- Evaluated `theme: me.theme?.includes('dark') ? 'dark' : 'light'` inline inside `afterSetOffscreenRegistered` in `src/component/Sparkline.mjs` to ensure the correct string is passed.

## Timeline

- 2026-02-24T02:20:03Z @tobiu added the `bug` label
- 2026-02-24T02:20:03Z @tobiu added the `ai` label
- 2026-02-24T02:20:03Z @tobiu added the `core` label
- 2026-02-24T02:20:31Z @tobiu assigned to @tobiu
- 2026-02-24T02:20:42Z @tobiu referenced in commit `a1db13e` - "fix(canvas): React to theme changes (#9283)

The Sparkline canvas widget does not update its colors when the global application theme changes (e.g., to dark mode) because the theme config is only passed on initial registration, but updateConfig in the worker does not handle it dynamically.

Updated updateConfig in src/canvas/Sparkline.mjs to apply theme changes and trigger a redraw.

Evaluated theme inline inside afterSetOffscreenRegistered in src/component/Sparkline.mjs to ensure the correct string is passed."
### @tobiu - 2026-02-24T02:20:52Z

The fix has been implemented and pushed to the `dev` branch.

- 2026-02-24T02:21:04Z @tobiu closed this issue

