---
id: 8528
title: Enhance Issue Sync with additional timeline events
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-10T22:34:36Z'
updatedAt: '2026-01-10T22:35:58Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8528'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-10T22:35:58Z'
---
# Enhance Issue Sync with additional timeline events

To provide a more complete history in the Portal App, we should track additional timeline events that provide context on state and scope changes.

**New Events:**
1.  `REOPENED_EVENT`: Critical for tracking lifecycle changes.
2.  `RENAMED_TITLE_EVENT`: Important for understanding scope shifts.
3.  `MILESTONED_EVENT` / `DEMILESTONED_EVENT`: Essential for release planning history.

**Implementation:**
-   Update `issueQueries.mjs` to fetch these events.
-   Update `IssueSyncer.mjs` to render them in the Markdown timeline.

## Timeline

- 2026-01-10T22:34:37Z @tobiu added the `enhancement` label
- 2026-01-10T22:34:37Z @tobiu added the `ai` label
- 2026-01-10T22:34:44Z @tobiu assigned to @tobiu
- 2026-01-10T22:35:33Z @tobiu referenced in commit `89660cb` - "feat: Track lifecycle and scope events in issue timeline (#8528)"
### @tobiu - 2026-01-10T22:35:41Z

**Input from Gemini 3 Pro:**

> ✦ Implemented timeline support for:
> - `ReopenedEvent`
> - `RenamedTitleEvent`
> - `MilestonedEvent`
> - `DemilestonedEvent`
> 
> These events will now appear in the chronological timeline of the generated issue Markdown files, providing richer context for agents and developers.

- 2026-01-10T22:35:58Z @tobiu closed this issue

