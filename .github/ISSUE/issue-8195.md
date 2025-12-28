---
id: 8195
title: 'Feat: Neural Link - Get Record Tool'
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T22:39:07Z'
updatedAt: '2025-12-28T22:43:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8195'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Feat: Neural Link - Get Record Tool

**Context:**
Agents often need to inspect a specific record in detail, especially when `inspect_store` returns only a sample or when a record ID is obtained from another source (e.g., a component selection).

**Requirement:**
1.  **Enhance `DataService`:** Add `getRecord(sessionId, recordId)`.
2.  **Tool:** `get_record(recordId)`:
    -   Locates the record (potentially via `Neo.manager.Instance` or `Neo.manager.Store` lookups).
    -   Returns the full record data (serialized via `record.toJSON()` or similar).
    -   Include metadata: model class, store ID (if attached).

**Goal:** Provide granular access to individual data records.

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu assigned to @tobiu
- 2025-12-28 @tobiu added parent issue #8169

