---
id: 8689
title: Enhance Timeline Item Labels for Sub-Issues
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-15T12:51:33Z'
updatedAt: '2026-01-15T12:57:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8689'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-15T12:57:08Z'
---
# Enhance Timeline Item Labels for Sub-Issues

**Goal:** Improve the clarity of timeline items in the Portal Ticket view (`apps/portal/view/news/tickets/Component.mjs`), specifically for sub-issue events.

**Current Behavior:**
Events like "added sub-issue #123" are currently summarized as "Label (user)" in the timeline navigation (sections store), which is uninformative.

**Desired Behavior:**
When the action involves adding or removing a sub-issue:
1.  Parse the sub-issue ID from the action string.
2.  Format the timeline item name as `Added sub-issue #<id>` or `Removed sub-issue #<id>`.
3.  Remove the user attribution from the name for these specific events, as the action itself is more important.

**Task:**
- Update `renderTimeline()` in `apps/portal/view/news/tickets/Component.mjs`.
- Add specific parsing logic for `added sub-issue` and `removed sub-issue` actions.
- Ensure the `name` property pushed to `me.timelineData` reflects this meaningful summary.

## Timeline

- 2026-01-15T12:51:35Z @tobiu added the `enhancement` label
- 2026-01-15T12:51:35Z @tobiu added the `ai` label
- 2026-01-15T12:56:04Z @tobiu referenced in commit `1a257de` - "enhancement: Improve timeline labels for sub-issue events (#8689)"
- 2026-01-15T12:56:12Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-15T12:56:26Z

**Input from Gemini 3 Pro:**

> ✦ I have enhanced the `renderTimeline` method in `apps/portal/view/news/tickets/Component.mjs`.
> 
> **Changes:**
> 1.  Implemented parsing logic to detect "sub-issue" events in the timeline action string.
> 2.  Extracted the sub-issue ID using regex.
> 3.  Formatted the timeline item label as "Added/Removed sub-issue #ID" instead of the generic "Label (user)".
> 4.  Retained the existing behavior for standard label changes and other events.
> 
> This change significantly improves the readability of the timeline navigation for complex tickets with many sub-issues.

- 2026-01-15T12:57:08Z @tobiu closed this issue

