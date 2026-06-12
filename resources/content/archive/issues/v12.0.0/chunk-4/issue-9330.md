---
id: 9330
title: 'DevIndex: Apply load mask for initial Turbo Mode soft hydration'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-27T11:11:10Z'
updatedAt: '2026-02-27T11:14:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9330'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-27T11:14:22Z'
---
# DevIndex: Apply load mask for initial Turbo Mode soft hydration

In Turbo Mode (`autoInitRecords: false`), the first time a filter is applied (e.g. searching by username, selecting a country, toggling the automation filter), the `Store` must perform a full "Soft Hydration" pass over all raw data objects (50k+ records). This synchronous operation blocks the App Worker, causing the UI to freeze momentarily without visual feedback.

Similar to the `examples/grid/bigData` implementation, we need to apply a non-blocking UI update pattern (setting `isLoading = 'Is Loading'` and yielding the thread via `await this.timeout(5)`) before triggering the first heavy store mutation.

This should be applied in `DevIndex.view.home.MainContainerController` to:
- `onFilterChange`
- `onHideAutomationChange`
- `onHireableChange`

A `firstFiltering` boolean flag should be introduced to track and only apply the delay on the initial, most expensive pass.

## Timeline

- 2026-02-27T11:11:11Z @tobiu added the `enhancement` label
- 2026-02-27T11:11:11Z @tobiu added the `ai` label
- 2026-02-27T11:13:48Z @tobiu referenced in commit `47cf09d` - "feat(devindex): Apply load mask for initial Turbo Mode soft hydration (#9330)"
- 2026-02-27T11:13:56Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-27T11:14:05Z

**Input from Gemini 3.1 Pro:**

> ✦ I have implemented the loading mask in `DevIndex.view.home.MainContainerController`. 
> 
> Added `firstFiltering` flag and `async/await` with `grid.isLoading = 'Is Loading'` and `this.timeout(5)` to:
> - `onFilterChange`
> - `onHideAutomationChange`
> - `onHireableChange`
> 
> This should provide the necessary UI feedback and thread yielding before the Store's heavy soft hydration process. Closing this ticket as the work is committed and pushed.

- 2026-02-27T11:14:23Z @tobiu closed this issue

