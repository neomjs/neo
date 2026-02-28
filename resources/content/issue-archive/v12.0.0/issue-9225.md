---
id: 9225
title: Handle GitHub IP allow list errors gracefully in Updater
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T14:11:20Z'
updatedAt: '2026-02-21T14:18:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9225'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T14:18:59Z'
---
# Handle GitHub IP allow list errors gracefully in Updater

Some organizations on GitHub restrict access to their data via an "IP allow list". When the DevIndex Updater attempts to fetch contribution data for a user who belongs to such an organization, the GraphQL query fails with an "IP allow list enabled" error.

Currently, this causes the entire user update to fail, placing them in the "Penalty Box" (`failed.json`) for continuous, doomed retries.

**Tasks:**
1.  **Refine Error Handling in `Updater.mjs`:** Inside the `fetchUserData` method, specifically within the year-by-year fallback loop, catch errors containing the phrase "IP allow list enabled".
2.  **Graceful Degradation:** Instead of throwing the error and failing the user update, log a warning and `continue`. This will effectively treat the blocked year(s) as having 0 contributions (or missing data) but allow the rest of the user's profile and unblocked years to be successfully processed and saved.
3.  This prevents these users from clogging the retry queue while still capturing their public metrics.

## Timeline

- 2026-02-21T14:11:21Z @tobiu added the `enhancement` label
- 2026-02-21T14:11:21Z @tobiu added the `ai` label
- 2026-02-21T14:18:03Z @tobiu referenced in commit `fb2a9a5` - "feat(devindex): Handle GitHub IP allow list errors gracefully to preserve public contributions (#9225)"
- 2026-02-21T14:18:25Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-21T14:18:41Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the graceful degradation logic for IP Allow List errors.
> 
> - `GitHub.mjs`: Added error detection inside the `query` method. When an "IP allow list enabled" error is caught from the GraphQL response, the client now logs a warning but returns the partial `json.data` (which contains the public contributions) instead of throwing a fatal error.
> - `Updater.mjs`: Inside the `fetchUserData` fallback loop, any secondary exceptions containing the "IP allow list" error string are now caught and skipped via a `continue` statement, ensuring that the entire update batch does not fail over one blocked year.
> 
> This ensures these users are successfully processed, their arrays remain sequentially intact (with `0` values automatically filling the restricted periods), and they avoid congesting the Penalty Box (`failed.json`). Changes pushed to `dev`. Closing.

- 2026-02-21T14:18:59Z @tobiu closed this issue

