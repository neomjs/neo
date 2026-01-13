---
id: 8583
title: Refine TimelineCanvas reset logic to use Ticket ID comparison
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-12T23:35:00Z'
updatedAt: '2026-01-13T02:14:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8583'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-13T02:14:21Z'
---
# Refine TimelineCanvas reset logic to use Ticket ID comparison

Currently, `TimelineCanvas` resets the animation whenever `onTimelineDataLoad` is called without the `isResize` flag. This works for ticket switches but relies on the assumption that store loads always imply a context switch.

We will verify this behavior and refactor `onTimelineDataLoad` to:
1.  Extract the Ticket ID from the first record (e.g., `timeline-{ticketId}-0`).
2.  Compare it with the previously loaded Ticket ID.
3.  Only set `reset: true` if the Ticket ID has changed.

This ensures that resizing, expanding summaries, or even refreshing data for the *same* ticket will maintain the animation continuity, while switching tickets will correctly reset it.

## Timeline

- 2026-01-12T23:35:01Z @tobiu added the `enhancement` label
- 2026-01-12T23:35:01Z @tobiu added the `ai` label
- 2026-01-13T02:13:08Z @tobiu assigned to @tobiu
- 2026-01-13T02:14:11Z @tobiu referenced in commit `9691bc8` - "#8583, #8584, removed obsolete onContentClick (edit&refresh) logic"
- 2026-01-13T02:14:22Z @tobiu closed this issue

