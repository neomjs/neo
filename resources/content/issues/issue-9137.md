---
id: 9137
title: Implement ID-Based Rename Handling for DevIndex
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T02:23:45Z'
updatedAt: '2026-02-13T13:20:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9137'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T13:20:12Z'
---
# Implement ID-Based Rename Handling for DevIndex

Currently, when a user changes their GitHub username, the DevIndex `Updater` fails with a 404 (Not Found) because it queries by the old `login`. This results in the user being moved to the Penalty Box and eventually deleted, while the new username might be rediscovered as a fresh user, losing history continuity.

**The Solution: ID-Based Rename Recovery**

1.  **Trigger:** When `fetchUserData(login)` returns a 404/Not Found.
2.  **Lookup:** Retrieve the immutable `github_id` (field `i`) from our local `users.jsonl` record for that login.
3.  **Recovery:** Query the GitHub API using the ID (`node(id: "...")` or `user(id: ...)`) to find the *current* login.
4.  **Resolution:**
    -   **If Found (New Login):**
        -   Update `tracker.json`: Remove old key, add new key (preserve timestamp or reset).
        -   Update `users.jsonl`: Update `l` (login) and `n` (name) fields.
        -   Log the rename event.
    -   **If Not Found:** Confirm it is a deletion/suspension. Move to Penalty Box (as per existing logic).

This ensures we track the *human*, not just the *handle*.

## Timeline

- 2026-02-13T02:23:46Z @tobiu added the `enhancement` label
- 2026-02-13T02:23:46Z @tobiu added the `ai` label
- 2026-02-13T02:24:10Z @tobiu assigned to @tobiu
- 2026-02-13T02:24:25Z @tobiu added parent issue #9106
- 2026-02-13T13:15:44Z @tobiu referenced in commit `b50101a` - "feat: Implement ID-Based Rename Handling for DevIndex (#9137)

- Added 'getLoginByDatabaseId' to GitHub service to resolve logins from integer IDs
- Added 'deleteUsers' (batch removal) to Storage service
- Updated Updater service to detect renames when 404s occur for users with known IDs
- Implemented automatic recovery: Old login is removed, new login is fetched and added immediately"
### @tobiu - 2026-02-13T13:16:05Z

**Input from Gemini 3 Pro:**

> ✦ Implemented ID-Based Rename Handling for DevIndex.
> 
> **Key Components:**
> 
> 1.  **GitHub Service (`GitHub.mjs`):**
>     -   Added `getLoginByDatabaseId(dbId)`: Queries the GraphQL API using the integer `databaseId` (stored in our `users.jsonl` as `i`) to resolve the current `login`.
> 
> 2.  **Storage Service (`Storage.mjs`):**
>     -   Added `deleteUsers(logins)`: Efficiently removes a batch of users from the rich data store (`users.jsonl`). This is crucial for cleaning up the old/stale login records after a rename is detected.
> 
> 3.  **Updater Service (`Updater.mjs`):**
>     -   Enhanced `processBatch` with a Rename Detection Logic flow inside the error handler.
>     -   **Trigger:** When a user fetch fails with a fatal error (404/Not Found) *AND* we have a record of that user with a GitHub ID (`i`).
>     -   **Resolution:**
>         1.  Queries GitHub for the new login using the ID.
>         2.  If a new login is returned (and is different from the old one):
>             -   **Prune Old:** Marks the old login for deletion from `tracker.json` (via `indexUpdates`) and `users.jsonl` (via `prunedLogins`).
>             -   **Fetch New:** Immediately fetches data for the new login.
>             -   **Persist New:** Adds the new user data to `results` and `indexUpdates`.
>     -   **Outcome:** The system self-heals. The old record is replaced by the new one without losing continuity (other than the login key change).
> 
> This logic ensures that high-value users who rename their accounts are not lost or penalized.

- 2026-02-13T13:20:12Z @tobiu closed this issue

