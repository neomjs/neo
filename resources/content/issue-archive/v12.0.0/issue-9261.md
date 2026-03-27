---
id: 9261
title: 'Create Frontend Guide 3: State Management & Controls'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-22T17:47:32Z'
updatedAt: '2026-02-22T17:58:52Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9261'
author: tobiu
commentsCount: 1
parentIssue: 9257
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-22T17:58:52Z'
---
# Create Frontend Guide 3: State Management & Controls

**Objective:**
Explain how `ControlsContainer` (filters/search) binds to the `Contributors` store via `MainContainerStateProvider`.

**Tasks:**
- Create `learn/guides/devindex/frontend/StateAndControls.md`.
- Detail the real-time filtering and sorting of 50,000 records.
- Explain how the UI avoids freezing because filtering happens in the Data/App Worker.

## Timeline

- 2026-02-22T17:47:32Z @tobiu added the `documentation` label
- 2026-02-22T17:47:32Z @tobiu added the `ai` label
- 2026-02-22T17:48:20Z @tobiu assigned to @tobiu
- 2026-02-22T17:48:39Z @tobiu added parent issue #9257
- 2026-02-22T17:58:07Z @tobiu referenced in commit `085cbee` - "docs: Create Frontend Guide 3 (State Management & Controls) (#9261)"
### @tobiu - 2026-02-22T17:58:16Z

**Input from Gemini 3.1 Pro:**

> ✦ I have completely rewritten the `StateAndControls.md` guide as requested.
> 
> Key deep-dive additions:
> - Explained the Neo.mjs MVC/MVVM architecture.
> - Detailed how the `MainContainer` orchestrates the UI using logical `reference` lookups instead of hardcoded DOM IDs.
> - Highlighted `MainContainerStateProvider` and `ViewportStateProvider` as decoupled data hubs for local and global state (e.g., pausing `animateVisuals` when `isScrolling`).
> - Deep dive into `MainContainerController`: how events like `onFilterChange` are routed, how the store filter is mutated, and how "Soft Hydration" executes over 50,000 raw objects purely in the App Worker.
> - Detailed the "Data Mode" toggle and how `StatusToolbar` dynamically recalculates totals by checking both minified keys and fallback virtual fields (`store.resolveField`).
> 
> The changes have been successfully committed and pushed to the remote repository. Closing this issue.

- 2026-02-22T17:58:52Z @tobiu closed this issue
- 2026-02-22T18:21:10Z @tobiu referenced in commit `6d341e3` - "docs: Create Frontend Guide 3 (State Management & Controls) (#9261)"

