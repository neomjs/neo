---
id: 8533
title: 'Portal Ticket Timeline: Localized & Smart Timestamp Formatting'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T00:48:13Z'
updatedAt: '2026-01-11T00:55:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8533'
author: tobiu
commentsCount: 1
parentIssue: 8398
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T00:55:24Z'
---
# Portal Ticket Timeline: Localized & Smart Timestamp Formatting

Update `Portal.view.news.tickets.Component` to consume the new raw ISO timestamps from the re-synced markdown files.

**Tasks:**
1.  **Regex Updates:** Adapt `regexTimelineEvent` and the comment header parsing to match ISO 8601 strings (e.g., `2026-01-11T14:30:00Z`) instead of the legacy formatted strings.
2.  **Smart Formatting:** Implement a `formatTimestamp(isoString)` method:
    -   **Today:** Show time only (e.g., "14:30" or "2:30 PM").
    -   **History:** Show concise date + time (e.g., "Jan 10, 14:30").
    -   Use `Intl.DateTimeFormat` to respect the user's locale.

## Timeline

- 2026-01-11T00:48:14Z @tobiu added the `enhancement` label
- 2026-01-11T00:48:14Z @tobiu added the `ai` label
- 2026-01-11T00:54:34Z @tobiu referenced in commit `0249d07` - "feat: Implement smart localized timestamp formatting for Tickets (#8533)"
- 2026-01-11T00:54:58Z @tobiu assigned to @tobiu
### @tobiu - 2026-01-11T00:55:07Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the smart localized timestamp formatting.
> - Added `regexTimelineEvent` support for ISO 8601 strings.
> - Implemented `formatTimestamp` using `Intl.DateTimeFormat` with optimization (reusing formatters).
> - Updated `renderTimeline` and `frontMatterToHtml` to use the new formatting logic.
> - Timestamps now show "Today HH:MM" or "MMM DD, YYYY HH:MM" based on the date.

- 2026-01-11T00:55:24Z @tobiu closed this issue
- 2026-01-11T00:55:28Z @tobiu added parent issue #8398

