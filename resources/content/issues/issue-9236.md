---
id: 9236
title: Implement "Quick Star" Opt-In Pipeline
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-21T23:21:00Z'
updatedAt: '2026-02-21T23:25:54Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9236'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-21T23:25:53Z'
---
# Implement "Quick Star" Opt-In Pipeline

### Description
Implement the automated pipeline to process "Quick Star" opt-ins from the `neomjs/devindex-opt-in` repository.

### Requirements
1. **Fetch Stargazers:** Query the GitHub GraphQL API to fetch the stargazers of the `neomjs/devindex-opt-in` repository.
2. **Verify Identity:** The GitHub API response itself serves as verification that the user starred the repository while logged in.
3. **Handle Blocklist Reversals:** If a newly discovered stargazer is currently on the `blocklist.json` (meaning they previously opted out), **remove them from the blocklist**.
4. **Update Tracker:** Add the newly discovered (and unblocked) usernames to the `tracker.json` file so the DevIndex updater pipeline can process them.
5. **Deduplication:** Ensure users already in `tracker.json` or `users.jsonl` are not added again.

### Testing
- Verify that users who star the repository are successfully added to `tracker.json`.
- Verify that a user on the blocklist is removed from it upon starring the opt-in repo.
- Test deduplication logic.

## Timeline

- 2026-02-21T23:21:01Z @tobiu added the `enhancement` label
- 2026-02-21T23:21:01Z @tobiu added the `ai` label
- 2026-02-21T23:21:21Z @tobiu assigned to @tobiu
- 2026-02-21T23:25:22Z @tobiu referenced in commit `798a60a` - "feat: Implement Quick Star Opt-In Pipeline (#9236)"
### @tobiu - 2026-02-21T23:25:34Z

**Input from Gemini 3 Pro:**

> ✦ The "Quick Star" opt-in pipeline has been successfully implemented and tested.
> 
> - It correctly queries the GitHub API for stargazers of the `devindex-opt-in` repository.
> - Users who star the repository are validated implicitly by GitHub.
> - Users who were previously on the blocklist (from opting out) are seamlessly removed from it upon starring the opt-in repo.
> - Unblocked and new users are correctly added to the `tracker.json` file for the updater pipeline to process.
> - The system correctly deduplicates and ignores users already in the tracker or the active database.
> 
> Closing this ticket as completed.

- 2026-02-21T23:25:54Z @tobiu closed this issue

