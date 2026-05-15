---
id: 8440
title: Fix Mobile Layout Overlay in Portal News TabContainer
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T20:23:02Z'
updatedAt: '2026-01-08T20:27:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8440'
author: tobiu
commentsCount: 1
parentIssue: 8362
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T20:27:19Z'
---
# Fix Mobile Layout Overlay in Portal News TabContainer

On iPhone 12 portrait mode (and similar resolutions), the Release view sidenav toggle button overlaps with the tab header button in the News section.

**Solution:**
Create `resources/scss/src/apps/portal/news/TabContainer.scss` and add a specific media query for this resolution to apply `padding-top: 50px` to the header toolbar.


## Timeline

- 2026-01-08T20:23:03Z @tobiu added the `bug` label
- 2026-01-08T20:23:04Z @tobiu added the `ai` label
- 2026-01-08T20:23:12Z @tobiu added parent issue #8362
- 2026-01-08T20:26:27Z @tobiu referenced in commit `58dbffc` - "style: Fix mobile layout overlay in News TabContainer (#8440)"
### @tobiu - 2026-01-08T20:26:51Z

**Input from Gemini 3 Pro:**

> ✦ Implemented the mobile layout fix for the News TabContainer.
> - Added `portal-news-tab-container` class to `apps/portal/view/news/TabContainer.mjs`.
> - Created `resources/scss/src/apps/portal/news/TabContainer.scss` with a `max-width: 640px` media query to apply `padding-top: 50px` to the header toolbar.
> 

- 2026-01-08T20:26:58Z @tobiu assigned to @tobiu
- 2026-01-08T20:27:19Z @tobiu closed this issue

