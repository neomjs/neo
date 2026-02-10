---
id: 9084
title: 'Enhancement: DevRank Atomic File Persistence'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-10T14:08:17Z'
updatedAt: '2026-02-10T14:12:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9084'
author: tobiu
commentsCount: 1
parentIssue: 8930
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T14:12:44Z'
---
# Enhancement: DevRank Atomic File Persistence

Implement atomic file writing in `DevRank.services.Storage` to prevent data corruption during process crashes or power failures.

**Current State:**
`Storage.mjs` uses `fs.writeFile` to directly overwrite critical data files (`users.json`, `tracker.json`). If the write operation is interrupted, the file may be left in a truncated or corrupted state.

**Requirement:**
1.  Refactor `writeJson` (or internal helper) to:
    -   Write data to a temporary file (e.g., `filename.json.tmp`).
    -   Flush/Sync to disk.
    -   Use `fs.rename` to atomically replace the target file with the temporary file.
2.  Ensure this applies to all critical JSON stores (`tracker`, `users`, `visited`, `blacklist`).

**Benefits:**
Guarantees that the data files are always valid JSON, even if the Updater crashes mid-write.

## Timeline

- 2026-02-10T14:08:19Z @tobiu added the `enhancement` label
- 2026-02-10T14:08:19Z @tobiu added the `ai` label
- 2026-02-10T14:09:40Z @tobiu added parent issue #8930
- 2026-02-10T14:09:42Z @tobiu assigned to @tobiu
- 2026-02-10T14:12:19Z @tobiu referenced in commit `59e42ec` - "Enhancement: Implement Atomic File Persistence (#9084)"
### @tobiu - 2026-02-10T14:12:23Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `DevRank.services.Storage` to use atomic file writes.
> 
> **Implementation:**
> The `writeJson` method now follows this safe pattern:
> 1.  Writes data to a temporary file (`filename.tmp`).
> 2.  Renames the temporary file to the target filename (`fs.rename`).
> 
> This ensures that `users.json` and `tracker.json` are never left in a corrupted or truncated state if the process crashes during a write operation. The `.tmp` file is naturally cleaned up by the rename operation on success. In case of a crash, a leftover `.tmp` file might remain, but the critical data file stays intact.

- 2026-02-10T14:12:44Z @tobiu closed this issue

