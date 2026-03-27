---
id: 9135
title: Implement Safe Purge for Invalid Users in DevIndex Updater
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-13T02:13:04Z'
updatedAt: '2026-02-13T02:16:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9135'
author: tobiu
commentsCount: 1
parentIssue: 9106
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-13T02:16:55Z'
---
# Implement Safe Purge for Invalid Users in DevIndex Updater

We need a mechanism to purge invalid entities (Organizations, deleted users) from the `tracker.json` index while ensuring we don't accidentally delete valid users due to API glitches.

**The "Safe Purge" Protocol:**

1.  **Trigger:** `Updater.mjs` catches a fatal error (`Could not resolve to a User` or `NOT_FOUND`).
2.  **Safety Check:** Check if the user exists in `users.jsonl` (Rich Data Store).
    -   **If Exists:** This implies the user was valid in the past. Treat the 404 as suspicious (glitch, rename, suspension). **Action:** Move to Penalty Box (`failed.json`) for manual review. Do NOT delete.
    -   **If NOT Exists:** The user has never been indexed. It is likely a "Bad Seed" (Org, Bot, Typo) that leaked into the tracker. **Action:** Mark for deletion (`{ delete: true }`) in `tracker.json`.

**Implementation:**
-   Modify `apps/devindex/services/Updater.mjs` inside `processBatch`.
-   Load `users.jsonl` (or use `Storage.getUsers()`) to perform the existence check.

## Timeline

- 2026-02-13T02:13:04Z @tobiu added the `bug` label
- 2026-02-13T02:13:05Z @tobiu added the `enhancement` label
- 2026-02-13T02:13:05Z @tobiu added the `ai` label
- 2026-02-13T02:13:18Z @tobiu assigned to @tobiu
- 2026-02-13T02:13:34Z @tobiu added parent issue #9106
- 2026-02-13T02:16:18Z @tobiu referenced in commit `5694710` - "feat(devindex): Implement Safe Purge for invalid users (#9135)"
### @tobiu - 2026-02-13T02:16:31Z

**Input from Gemini 3 Pro:**

> ✦ I have implemented the **Safe Purge Protocol** in `Updater.mjs`.
> 
> **Self-Healing Logic:**
> 1.  **Fatal Error Detection:** The updater now catches "Could not resolve to a User" and "NOT_FOUND" errors.
> 2.  **Safety Check:** It checks if the failed user exists in the rich data store (`users.jsonl`).
>     -   **Bad Seed (New):** If the user has *no history*, they are immediately **Deleted** from `tracker.json`. This cleans up leaked organizations like `loomnetwork`.
>     -   **Fallen Hero (Existing):** If the user *has history*, they are moved to the **Penalty Box** (`failed.json`) instead. This protects valid users who might be temporarily hidden or renamed from being accidentally wiped.
> 
> **Documentation:**
> I added a comprehensive JSDoc block to `processBatch` explaining this logic to ensure future maintainers understand the "Why" behind the deletion.

- 2026-02-13T02:16:55Z @tobiu closed this issue

