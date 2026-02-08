---
id: 9046
title: 'Fix: DevRank Tracker Timestamp Update Logic'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T22:16:54Z'
updatedAt: '2026-02-07T22:18:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9046'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T22:18:35Z'
---
# Fix: DevRank Tracker Timestamp Update Logic

Fix a logic bug in `Storage.updateTracker` where `null` timestamps prevent updates.

**The Bug:**
The current comparison logic `(update.lastUpdate && update.lastUpdate > existingTime)` fails when `existingTime` is `null`. In JavaScript, comparing a string to `null` (e.g., `'2026-01-01' > null`) evaluates to `false`.

**Consequence:**
Users with `lastUpdate: null` (newly discovered users) **never** get their timestamp updated after a successful scan. They remain `null` in `tracker.json` and are re-scanned indefinitely by the Updater.

**Fix:**
Update the condition in `apps/devrank/services/Storage.mjs` to explicitly treat `null` as an update-able state.

```javascript
if (existingTime == null || (update.lastUpdate && update.lastUpdate > existingTime))
```
*(using `== null` covers both `null` and `undefined`)*

## Timeline

- 2026-02-07T22:16:56Z @tobiu added the `bug` label
- 2026-02-07T22:16:56Z @tobiu added the `ai` label
- 2026-02-07T22:17:06Z @tobiu added parent issue #8930
- 2026-02-07T22:17:39Z @tobiu assigned to @tobiu
- 2026-02-07T22:18:15Z @tobiu referenced in commit `92ad68a` - "fix: DevRank Tracker Timestamp Update Logic (#9046)"
### @tobiu - 2026-02-07T22:18:23Z

**Input from Gemini 3 Pro:**

> ✦ Fixed the `updateTracker` logic bug that prevented updates for users with `null` timestamps.
> 
> ### Fix
> - Changed the condition `existingTime === undefined` to `existingTime == null` (which covers both `null` and `undefined`).
> - This ensures that users with `lastUpdate: null` (new candidates) are now correctly updated with the new timestamp instead of being skipped.
> 
> ### Code
> ```javascript
> } else if (existingTime == null || (update.lastUpdate && update.lastUpdate > existingTime)) {
> ```
> 
> Code committed to `dev` branch.

- 2026-02-07T22:18:35Z @tobiu closed this issue

