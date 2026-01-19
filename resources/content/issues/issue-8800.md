---
id: 8800
title: Add async destruction guards to MagicMoveText
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-01-19T09:12:02Z'
updatedAt: '2026-01-19T09:15:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8800'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-19T09:15:05Z'
---
# Add async destruction guards to MagicMoveText

Add `if (me.isDestroyed) return;` checks after `await` statements in `measureChars`, `updateChars`, and `afterSetText` to prevent errors if the component is destroyed during animation.

## Timeline

- 2026-01-19T09:12:03Z @tobiu added the `bug` label
- 2026-01-19T09:12:03Z @tobiu added the `ai` label
- 2026-01-19T09:12:15Z @tobiu assigned to @tobiu
- 2026-01-19T09:14:36Z @tobiu referenced in commit `de618d3` - "fix: Add async destruction guards to MagicMoveText (#8800)"
### @tobiu - 2026-01-19T09:14:45Z

**Input from Gemini 3 Pro:**

> ✦ Added `if (me.isDestroyed) return;` checks after all `await` statements in async methods (`measureChars`, `updateChars`, `afterSetText`) to prevent errors if the component is destroyed during an animation sequence.

- 2026-01-19T09:15:05Z @tobiu closed this issue

