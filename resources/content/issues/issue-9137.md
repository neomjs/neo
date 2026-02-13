---
id: 9137
title: Implement ID-Based Rename Handling for DevIndex
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T02:23:45Z'
updatedAt: '2026-02-13T02:24:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9137'
author: tobiu
commentsCount: 0
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

