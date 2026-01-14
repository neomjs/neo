---
id: 8532
title: '[AI] Add Time Precision to Issue Timeline Events'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T00:26:50Z'
updatedAt: '2026-01-11T00:32:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8532'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-11T00:32:07Z'
---
# [AI] Add Time Precision to Issue Timeline Events

The `IssueSyncer` currently formats timeline events with only the date (YYYY-MM-DD), while comments include the time. This inconsistency makes it difficult to understand the order of operations when multiple events occur on the same day.

**Goal:**
Update the timeline formatting to include timestamps for all event types, ensuring the chronological order is visually preserved in the generated Markdown.

**Implementation:**
- Modify `IssueSyncer.mjs`.
- Extract HH:mm from the `createdAt` ISO string (UTC).
- Format events as `YYYY-MM-DD HH:mm`.

## Timeline

- 2026-01-11T00:26:51Z @tobiu added the `enhancement` label
- 2026-01-11T00:26:51Z @tobiu added the `ai` label
- 2026-01-11T00:27:51Z @tobiu referenced in commit `bc5d63a` - "feat: Include timestamps in issue timeline events (#8532)"
- 2026-01-11T00:28:36Z @tobiu assigned to @tobiu
- 2026-01-11T00:31:39Z @tobiu referenced in commit `f701383` - "feat: Use raw ISO timestamp for timeline events (#8532)"
### @tobiu - 2026-01-11T00:31:46Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `IssueSyncer.mjs` to use the raw `createdAt` timestamp (ISO 8601) for all timeline events. This allows the Portal App to handle localization and formatting based on user preferences.

- 2026-01-11T00:32:07Z @tobiu closed this issue

