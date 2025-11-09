---
id: 7322
title: Implement Memory Backup and Restore
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-01T21:31:27Z'
updatedAt: '2025-10-02T10:05:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7322'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-02T10:05:14Z'
---
# Implement Memory Backup and Restore

**Reported by:** @tobiu on 2025-10-01

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

The agent's memory database is a persistent, cumulative asset that cannot be regenerated from source files. To prevent accidental data loss, a robust backup and restore mechanism is required. This ticket covers the creation of scripts to export and import the memory database.

## Acceptance Criteria

1.  A new script is created (e.g., `buildScripts/ai/exportMemory.mjs`).
    -   This script connects to the memory ChromaDB.
    -   It exports all documents (content, metadata) into a portable, version-controllable format (e.g., a single JSON file or a directory of JSON files).
2.  A corresponding new script is created (e.g., `buildScripts/ai/importMemory.mjs`).
    -   This script reads the exported data.
    -   It intelligently upserts the data into the ChromaDB collection, allowing for a full restore to a new or empty database.
3.  The process is documented, so users understand how to back up their agent's memory.

