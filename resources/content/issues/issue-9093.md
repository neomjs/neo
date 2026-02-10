---
id: 9093
title: 'Refactor: DevRank Backend JSONL Persistence'
state: OPEN
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2026-02-10T18:05:34Z'
updatedAt: '2026-02-10T18:08:56Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9093'
author: tobiu
commentsCount: 0
parentIssue: 9089
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

