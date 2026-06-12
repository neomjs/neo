---
id: 8563
title: Prevent race condition in TimelineCanvas by making sections store update optional
state: CLOSED
labels:
  - bug
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-01-11T23:19:35Z'
updatedAt: '2026-01-11T23:27:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8563'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T23:27:51Z'
---
# Prevent race condition in TimelineCanvas by making sections store update optional

`Portal.view.shared.content.Component` automatically updates the `sections` store with extracted headlines in `modifyMarkdown`.
`Portal.view.news.tickets.Component` extends this class but overrides the `sections` store with **Timeline Data** instead.

This creates a race condition:
1.  `super.modifyMarkdown()` runs and pushes **Headlines** to the store.
2.  `TimelineCanvas` (listening to the store) tries to render these Headlines as timeline events, causing glitches (or successfully finding a stray element and rendering a bogus graph).
3.  `Tickets.Component` finishes parsing and pushes **Timeline Data** to the store.
4.  `TimelineCanvas` updates correctly.

To fix this, we need to make the store update in the base class optional.

**Proposed Change:**
1.  Add `updateSectionsStore: true` config to `Portal.view.shared.content.Component`.
2.  Wrap the store update in `modifyMarkdown` with `if (this.updateSectionsStore)`.
3.  Set `updateSectionsStore: false` in `Portal.view.news.tickets.Component`.


## Timeline

- 2026-01-11T23:19:37Z @tobiu added the `bug` label
- 2026-01-11T23:19:37Z @tobiu added the `ai` label
- 2026-01-11T23:19:37Z @tobiu added the `refactoring` label
- 2026-01-11T23:26:19Z @tobiu referenced in commit `605635a` - "fix: Prevent race condition in TimelineCanvas by making sections store update optional (#8562, #8563)"
- 2026-01-11T23:27:16Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T23:27:24Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the fix to prevent the "sections" store race condition.
> 
> **Changes:**
> 1.  **Shared Component**: Added `updateSectionsStore` config (default `true`) to `apps/portal/view/shared/content/Component.mjs`. Modified `modifyMarkdown` to only update the store if this flag is true.
> 2.  **Tickets Component**: Set `updateSectionsStore: false` in `apps/portal/view/news/tickets/Component.mjs`. This prevents the base class from pushing Headlines to the store, allowing the subclass to exclusively manage the store with Timeline data.
> 3.  **Tickets Component**: Added `construct` to initialize `contentComponentId` in the state provider, fixing the underlying ID resolution issue for `TimelineCanvas`.
> 
> This ensures `TimelineCanvas` only receives valid Timeline updates and no longer gets "flashed" with headline data during navigation.

- 2026-01-11T23:27:34Z @tobiu added parent issue #8398
- 2026-01-11T23:27:51Z @tobiu closed this issue

