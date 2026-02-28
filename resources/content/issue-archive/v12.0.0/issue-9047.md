---
id: 9047
title: 'Feat: DevRank Whitelist Synchronization & Protection'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-07T22:25:58Z'
updatedAt: '2026-02-07T22:27:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9047'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-07T22:27:57Z'
---
# Feat: DevRank Whitelist Synchronization & Protection

Ensure whitelisted users are always tracked and protected from pruning.

**Gaps Identified:**
1.  **Discovery Gap:** Adding a user to `whitelist.json` does nothing if they are not already in `tracker.json`. They will never be scheduled for an update.
2.  **Protection Gap:** While mostly protected, the tracker pruning logic in `Cleanup` relies on `users.json` presence. Explicitly checking the whitelist provides a stronger guarantee against accidental data loss.

**Rules:**
- **Blacklist Wins:** If a user is in both, Blacklist takes precedence.
- **Whitelist Resurrection:** If a user is in `whitelist.json` but missing from `tracker.json`, they must be added to `tracker` (with `lastUpdate: null`) to ensure immediate scanning.
- **Whitelist Protection:** Whitelisted users must never be pruned from `tracker.json` by the Cleanup service, regardless of their status in `users.json`.

**Changes in `apps/devrank/services/Cleanup.mjs`:**
1.  **Sync Step:** Iterate over `whitelist`. If user not in `tracker` AND not in `blacklist`, add to `tracker`.
2.  **Filter Step:** When filtering `tracker`, explicitly return `true` (keep) if user is whitelisted (and not blacklisted).

## Timeline

- 2026-02-07T22:25:59Z @tobiu added the `enhancement` label
- 2026-02-07T22:25:59Z @tobiu added the `ai` label
- 2026-02-07T22:26:17Z @tobiu added parent issue #8930
- 2026-02-07T22:26:44Z @tobiu assigned to @tobiu
- 2026-02-07T22:27:36Z @tobiu referenced in commit `e07e280` - "feat: DevRank Whitelist Synchronization & Protection (#9047)"
### @tobiu - 2026-02-07T22:27:45Z

**Input from Gemini 3 Pro:**

> ✦ Implemented Whitelist Synchronization and Protection in `Cleanup.mjs`.
> 
> ### Changes
> 1.  **Resurrection:** Before pruning, the service now iterates through `whitelist.json`. Any user found in the whitelist but missing from the tracker is added back with `lastUpdate: null`. This ensures they are immediately scheduled for an update.
> 2.  **Protection:** The tracker pruning filter now explicitly checks `whitelist.has(login)`. If a user is whitelisted (and not blacklisted), they are **never** removed from the tracker, even if they are missing from `users.json` (e.g., due to a failed update).
> 
> ### Logic Hierarchy
> 1.  **Blacklist:** Highest priority. Removes from everywhere.
> 2.  **Whitelist:** Protects from pruning and forces inclusion in tracker.
> 3.  **Threshold:** Prunes from `users.json` and `tracker.json` if failed.
> 
> Code committed to `dev` branch.

- 2026-02-07T22:27:58Z @tobiu closed this issue

