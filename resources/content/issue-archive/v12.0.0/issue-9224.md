---
id: 9224
title: Implement maxUsers cap for DevIndex GitHub Spider
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T13:50:41Z'
updatedAt: '2026-02-21T14:36:32Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9224'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T14:04:31Z'
---
# Implement maxUsers cap for DevIndex GitHub Spider

The DevIndex user database (`users.jsonl`) has grown to ~20MB (44k users). We need to implement a user cap (`maxUsers`) to prevent unbounded growth.

The strategy is to maintain a maximum number of users by pruning those with the lowest total contributions when new, higher-contributing users are discovered.

**Tasks:**
1.  **Configuration:** Add `maxUsers` to `apps/devindex/services/config.mjs` (e.g., default to 50,000).
2.  **Spider Adjustment (`Spider.mjs`):** The Spider currently adds *any* valid discovered user to the Tracker (`tracker.json`). If we are at the `maxUsers` cap, the Spider should only add new candidates if they are *likely* to displace a bottom-tier user. However, since the Spider doesn't fetch full stats, it might need to add them anyway, leaving the evaluation to the Updater. *Alternative:* The Spider might need a lightweight check, or we just let the Updater handle all pruning.
3.  **Updater Adjustment (`Updater.mjs`):** The Updater is where the actual evaluation happens. After fetching a user's stats, if the user meets the `minTotalContributions` threshold AND the total tracked users exceed `maxUsers`, the Updater must:
    - Compare the new user's total contributions (`tc`) against the lowest `tc` in the current `users.jsonl`.
    - If the new user has more, add the new user and *prune* the bottom user(s) to maintain the cap.
    - If the new user has fewer, discard the new user.
4.  **Storage adjustments (`Storage.mjs`):** Ensure the sorting and pruning logic is efficient given the file size.

*Note: The exact division of labor between Spider (discovery) and Updater (evaluation) needs to be finalized during implementation.*

## Timeline

- 2026-02-21T13:50:43Z @tobiu added the `epic` label
- 2026-02-21T13:50:43Z @tobiu added the `ai` label
- 2026-02-21T14:03:52Z @tobiu referenced in commit `23c3a28` - "feat(devindex): Implement maxUsers dynamic cap and pruning (#9224)"
- 2026-02-21T14:04:03Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T14:04:07Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the `maxUsers` cap for the DevIndex GitHub spider and updater as requested.
> 
> ### Key Changes:
> - Added `maxUsers: 50000` to the DevIndex Github configuration in `apps/devindex/services/config.mjs` and configured a path for `threshold.json`.
> - Modified `Storage.mjs` to automatically extract the total contributions of the lowest user when the `users.jsonl` file hits the `maxUsers` ceiling, write this value to `threshold.json`, and slice the array to the top 50,000 entries. It also performs cleanup of `tracker.json` and `failed.json` for pruned users.
> - Updated `Updater.mjs` to read from `threshold.json` via a new helper `getLowestContributionThreshold()`. This allows the Updater to evaluate candidates against a dynamically raising bar (`Math.max(config.github.minTotalContributions, threshold)`) without incurring the I/O cost of reading the massive 20MB `users.jsonl` database directly.
> 
> The task is now complete, and the changes have been pushed. Closing this issue.

- 2026-02-21T14:04:31Z @tobiu closed this issue
- 2026-02-21T14:36:32Z @tobiu removed the `epic` label
- 2026-02-21T14:36:32Z @tobiu added the `enhancement` label

