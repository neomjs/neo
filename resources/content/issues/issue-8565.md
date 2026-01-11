---
id: 8565
title: Scope timeline item IDs to Ticket ID to prevent stale rects on switch
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T23:37:43Z'
updatedAt: '2026-01-11T23:40:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8565'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T23:40:23Z'
---
# Scope timeline item IDs to Ticket ID to prevent stale rects on switch

When switching between tickets that happen to have the same number of timeline events, `TimelineCanvas` sometimes renders the "old" event positions.

**Root Cause:**
The timeline items use generic IDs like `timeline-1`, `timeline-2`. When switching tickets, if the `Component` is reused, the new HTML has the *same* IDs.
`TimelineCanvas` calls `waitForDomRect`. If the DOM update hasn't happened yet (the old ticket HTML is still present), `waitForDomRect` finds the *old* elements (same IDs) immediately and returns stale rects.

**Solution:**
Scope the timeline item IDs to the Ticket ID.
Instead of `timeline-1`, use `timeline-{ticketId}-1`.

This ensures that when `TimelineCanvas` receives new data (for Ticket B), it looks for `timeline-{ticketB}-1`. These elements do *not* exist in the old DOM (Ticket A). `waitForDomRect` will correctly wait until the new HTML is mounted.

**Changes:**
1.  Modify `apps/portal/view/news/tickets/Component.mjs` to include `me.record.id` in `bodyId` and generated timeline event IDs.


## Timeline

- 2026-01-11T23:37:45Z @tobiu added the `bug` label
- 2026-01-11T23:37:45Z @tobiu added the `ai` label
- 2026-01-11T23:39:39Z @tobiu referenced in commit `d90b171` - "fix: Scope timeline item IDs to Ticket ID to prevent stale rects (#8565)"
- 2026-01-11T23:39:46Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T23:39:57Z

**Input from Gemini 3 Pro:**

> ✦ I have scoped the timeline item IDs to the Ticket ID.
> 
> **Changes:**
> - Modified `apps/portal/view/news/tickets/Component.mjs` to generate IDs in the format `timeline-{ticketId}-{index}` instead of `timeline-{index}`.
> - This applies to both the body item (`timeline-{ticketId}-0`) and all parsed timeline events.
> 
> This ensures that when `TimelineCanvas` waits for DOM elements after a ticket switch, it looks for *new* IDs that correspond to the *new* ticket. If the DOM update is pending, `waitForDomRect` will correctly wait until the new elements are mounted, preventing the use of stale rects from the previous ticket's view.

- 2026-01-11T23:40:05Z @tobiu added parent issue #8398
- 2026-01-11T23:40:23Z @tobiu closed this issue

