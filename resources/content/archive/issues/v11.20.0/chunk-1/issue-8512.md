---
id: 8512
title: Refactor Ticket Badges to use Dynamic Label Store
state: CLOSED
labels:
  - enhancement
  - ai
  - refactoring
  - build
assignees:
  - tobiu
createdAt: '2026-01-10T17:52:22Z'
updatedAt: '2026-01-10T18:06:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8512'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T18:06:34Z'
---
# Refactor Ticket Badges to use Dynamic Label Store

Replace hardcoded SCSS label colors with a dynamic system driven by GitHub data.
This ensures perfect consistency between GitHub and the Portal, automated updates for new labels, and optimal text contrast ratios.

### Objectives
1.  **Enhance AI SDK:** Expose `LabelService` in `ai/services.mjs` to allow build scripts to fetch label data programmatically.
2.  **Build Infrastructure:** Create `buildScripts/createLabelIndex.mjs` to fetch labels via the SDK, calculate YIQ contrast for text colors, and generate `apps/portal/resources/data/labels.json`.
3.  **Data Layer:** Implement `Portal.model.Label` and `Portal.store.Labels` to consume the generated JSON.
4.  **UI Integration:** Update `Portal.view.news.tickets.Component` to bind to the store and apply colors via CSS variables, removing the hardcoded SCSS map.

### Tasks
- [ ] Export `GH_LabelService` in `ai/services.mjs`
- [ ] Create `buildScripts/createLabelIndex.mjs`
- [ ] Create `Portal.model.Label`
- [ ] Create `Portal.store.Labels`
- [ ] Update `Portal.view.news.tickets.Component.mjs` logic
- [ ] Remove color map from `apps/portal/resources/scss/src/apps/portal/news/tickets/Component.scss`

## Timeline

- 2026-01-10T17:52:23Z @tobiu added the `enhancement` label
- 2026-01-10T17:52:23Z @tobiu added the `ai` label
- 2026-01-10T17:52:23Z @tobiu added the `refactoring` label
- 2026-01-10T17:52:24Z @tobiu added the `build` label
### @tobiu - 2026-01-10T17:52:42Z

**Input from Gemini 3 Pro:**

> ✦ Starting work on exposing `GH_LabelService` in the AI SDK.

### @tobiu - 2026-01-10T17:53:28Z

**Input from Gemini 3 Pro:**

> ✦ Implemented `GH_LabelService` export in `ai/services.mjs`. Now creating the build script `buildScripts/createLabelIndex.mjs`.

- 2026-01-10T18:05:46Z @tobiu referenced in commit `cb695c6` - "feat: Refactor Ticket Badges to use Dynamic Label Store (#8512)"
### @tobiu - 2026-01-10T18:05:55Z

**Input from Gemini 3 Pro:**

> ✦ Completed refactoring:
> 1.  Exposed `GH_LabelService` in SDK.
> 2.  Created `buildScripts/createLabelIndex.mjs` to fetch and calculate label colors.
> 3.  Implemented `Portal.model.TicketLabel` and `Portal.store.TicketLabels`.
> 4.  Updated `Portal.view.news.tickets.Component` to use the store and CSS variables.
> 5.  Added the store to `MainContainerStateProvider` with `autoLoad`.
> 6.  Cleaned up SCSS.
> 
> Ready to close.

- 2026-01-10T18:06:19Z @tobiu assigned to @tobiu
- 2026-01-10T18:06:34Z @tobiu closed this issue

