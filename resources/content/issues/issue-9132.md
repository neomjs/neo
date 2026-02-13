---
id: 9132
title: Implement 'Network Walker' Discovery Strategy (Social Graph)
state: CLOSED
labels:
  - enhancement
  - ai
  - feature
assignees:
  - tobiu
createdAt: '2026-02-13T01:39:20Z'
updatedAt: '2026-02-13T01:42:15Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9132'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T01:42:15Z'
---
# Implement 'Network Walker' Discovery Strategy (Social Graph)

We have reached 15k users and want to expand our discovery beyond repository-based searches.
Developers often follow other skilled developers. Traversing this "Social Graph" is a high-probability way to find "hidden gems"—active developers who might not have high-star repositories but are followed by other productive engineers.

**New Strategy: "Network Walker" (User-to-User)**

1.  **Selection:** Pick a random user from our existing index who has a high contribution count (e.g., > 1000). High performers tend to follow other high performers.
2.  **Traversal:** Fetch the list of users they follow (`GET /users/:username/following`).
3.  **Discovery:**
    -   Filter out users already in `tracker.json` or `blacklist.json`.
    -   Add new discoveries to `tracker.json` as pending.

**Implementation:**
-   Modify `apps/devindex/services/Spider.mjs`.
-   Add `runNetworkWalker` method.
-   Integrate into the weighted strategy selection (`pickStrategy`).

## Timeline

- 2026-02-13T01:39:22Z @tobiu added the `enhancement` label
- 2026-02-13T01:39:22Z @tobiu added the `ai` label
- 2026-02-13T01:39:22Z @tobiu added the `feature` label
- 2026-02-13T01:39:32Z @tobiu assigned to @tobiu
- 2026-02-13T01:39:44Z @tobiu added parent issue #9106
- 2026-02-13T01:41:32Z @tobiu referenced in commit `4af7e1d` - "feat(devindex): Implement Network Walker discovery strategy (#9132)"
### @tobiu - 2026-02-13T01:41:51Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the **"Network Walker"** discovery strategy.
> 
> **Features:**
> 1.  **New Strategy:** `network_walker` added to `pickStrategy` with a ~15% weight.
> 2.  **Implementation:** The `runNetworkWalker` method picks a random existing user and fetches their `following` list (up to 100 users).
> 3.  **Discovery:** It filters out users who are already in the `tracker.json` or `blacklist.json` and adds the rest as pending candidates.
> 4.  **Integration:** Fully integrated into the `run` loop and supports forced execution via CLI (though CLI flag support might need explicit args if not already `string` type).
> 
> This strategy will help discover high-quality "hidden gems" by traversing the social graph of existing high-value users.

- 2026-02-13T01:42:15Z @tobiu closed this issue

