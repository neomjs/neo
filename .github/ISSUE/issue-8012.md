---
id: 8012
title: Enhance WebSocket Connection with Observable Events
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-03T14:35:11Z'
updatedAt: '2025-12-03T15:12:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8012'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-03T15:12:19Z'
---
# Enhance WebSocket Connection with Observable Events

**Goal:** Enhance `Neo.data.connection.WebSocket` to be a proper Observable by firing events for all lifecycle stages and removing hardcoded console logs.

**Requirements:**
1.  **Fire Events:**
    *   `close`: In `onClose`, fire `close` event with `{event, reason, wasClean}`.
    *   `error`: In `onError`, fire `error` event with `{error}`.
    *   `message`: In `onMessage`, fire `message` event with `{data}` (raw parsed JSON).
2.  **Remove Logs:** Remove the `console.log` statements in `onClose` and `onError`.
3.  **Maintain Compatibility:** Ensure existing promise-based message handling (`mId`) still works.

## Activity Log

- 2025-12-03 @tobiu added the `enhancement` label
- 2025-12-03 @tobiu assigned to @tobiu
- 2025-12-03 @tobiu added the `ai` label
- 2025-12-03 @tobiu referenced in commit `329c0d8` - "Enhance WebSocket Connection with Observable Events #8012"
- 2025-12-03 @tobiu closed this issue

