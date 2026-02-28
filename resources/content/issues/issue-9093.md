---
id: 9093
title: 'Refactor: DevRank Backend JSONL Persistence'
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-10T18:05:34Z'
updatedAt: '2026-02-10T18:51:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9093'
author: tobiu
commentsCount: 1
parentIssue: 9089
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-10T18:51:01Z'
---
# Refactor: DevRank Backend JSONL Persistence

## Objective
Ensure the DevRank backend (Spider/Updater/Storage) natively supports the `.jsonl` format to maintain data integrity with the new Streaming Proxy architecture.

## Rationale
Since we are migrating `users.json` to `users.jsonl` for performance (Epic #9089), the backend services must stop writing to the old JSON file. The `Updater` runs frequently, so any one-off conversion script will quickly become outdated. The backend itself must be the source of truth for JSONL.

## Tasks
1.  **Refactor `Storage.mjs`:**
    -   Implement `readJSONL(path)` and `writeJSONL(path, items)`.
    -   Update `updateUsers(newUsers)` to append/rewrite in JSONL format.
    -   Ensure atomic writes (write to `.tmp`, rename) are preserved for JSONL.

2.  **Refactor `Updater.mjs`:**
    -   Ensure it passes data compatible with the new storage methods (it likely already does, but verification is needed).

3.  **Migration Script (Final):**
    -   A final, authoritative script to convert the *latest* `users.json` to `users.jsonl` and delete the old file (or archive it).

## Dependencies
-   Blocked by #9090 and #9091 (Core Support).
-   Must be coordinated with #9092 (Frontend Switch) to avoid downtime.

## Timeline

- 2026-02-10T18:05:36Z @tobiu added the `ai` label
- 2026-02-10T18:05:36Z @tobiu added the `refactoring` label
- 2026-02-10T18:05:45Z @tobiu added parent issue #9089
- 2026-02-10T18:08:56Z @tobiu assigned to @tobiu
- 2026-02-10T18:50:14Z @tobiu referenced in commit `21abc63` - "refactor: Migrate DevRank to JSONL persistence and Streaming Proxy (#9093, #9092)"
### @tobiu - 2026-02-10T18:50:29Z

**Input from Gemini 3 Pro:**

> ✦ I have successfully migrated the DevRank backend to use JSONL.
> 
> ### Changes
> 1.  **`Storage.mjs`**: Updated `readJson` and `writeJson` to natively support `.jsonl` files (newline-delimited JSON). Added logic to detect the extension and switch parsing/serialization strategies.
> 2.  **`config.mjs`**: Updated `paths.users` to point to `users.jsonl`.
> 3.  **Migration Script**: Created and ran `apps/devrank/services/migrateJsonToJsonl.mjs` which successfully converted the existing 11k+ records to the new format and deleted the legacy file.
> 
> ### Verification
> -   The migration script verified the record count (11043) match.
> -   `Storage` logic for `users.json` legacy fallback remains (though unused by config).
> 
> This completes the backend persistence requirements.
> 

- 2026-02-10T18:51:01Z @tobiu closed this issue

