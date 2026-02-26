---
id: 9301
title: Persist DevIndex Animation Settings and Batch LocalStorage Reads
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-25T08:01:47Z'
updatedAt: '2026-02-25T17:32:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9301'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-25T17:32:35Z'
---
# Persist DevIndex Animation Settings and Batch LocalStorage Reads

We want to persist the user's choices for the animation checkboxes in DevIndex so that users with low-end devices can permanently disable them. 

To avoid sending multiple worker messages on startup, we will:
1. Enhance the `Neo.main.addon.LocalStorage.readLocalStorageItem` method to accept an array of strings for `opts.key`. If an array is provided, it will return an object containing all requested key-value pairs.
2. In `DevIndex.view.ViewportController`, update the startup logic to fetch `['devindexTheme', 'devindexSlowHeaderVisuals', 'devindexAnimateGridVisuals']` in a single call and apply them.
3. Update the DevIndex checkbox handlers to persist their state to `localStorage` when changed.

## Timeline

- 2026-02-25T08:01:48Z @tobiu added the `enhancement` label
- 2026-02-25T08:01:49Z @tobiu added the `ai` label
- 2026-02-25T10:50:35Z @tobiu referenced in commit `6fca720` - "feat(devindex): Persist DevIndex Animation Settings and Batch LocalStorage Reads (#9301)"
- 2026-02-25T15:43:35Z @tobiu assigned to @tobiu
- 2026-02-25T17:31:58Z @tobiu referenced in commit `2bc3e9d` - "fix(devindex): Resolve animation setting race conditions (#9301)"
- 2026-02-25T17:32:35Z @tobiu closed this issue
- 2026-02-25T18:32:43Z @tobiu referenced in commit `8e6e4b8` - "refactor(grid): Migrate Sparkline to useBindings (#9301, #9304)"
- 2026-02-25T18:36:30Z @tobiu referenced in commit `1fa6961` - "Merge branch 'feature/devindex-persist-animations' into dev (#9301)"
- 2026-02-25T19:07:35Z @tobiu referenced in commit `3451aa0` - "docs(devindex): Add documentation for animation controls and local storage (#9300, #9301)"

