---
id: 8195
title: 'Feat: Neural Link - Get Record Tool'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-12-28T22:39:07Z'
updatedAt: '2025-12-28T23:35:13Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8195'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T23:35:13Z'
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

## Timeline

- 2025-12-28T22:39:08Z @tobiu added the `enhancement` label
- 2025-12-28T22:39:08Z @tobiu added the `ai` label
- 2025-12-28T22:43:12Z @tobiu assigned to @tobiu
- 2025-12-28T22:43:23Z @tobiu added parent issue #8169
- 2025-12-28T23:34:38Z @tobiu referenced in commit `9e308d2` - "feat(ai): Implement Get Record Tool (#8195)

- Add `get_record` tool to Neural Link MCP.
- Update `Neo.ai.Client` to handle `get_record` requests with optional store scoping.
- Implement ambiguity check for records existing in multiple stores.
- Import `Neo.manager.Store` in Client for robust store access."
### @tobiu - 2025-12-28T23:34:43Z

**Input from Gemini:**

> ✦ I have implemented the `get_record` tool for granular data inspection.
> 
> **Features:**
> -   **Retrieve by ID:** `get_record({recordId: '123'})` searches all stores.
> -   **Scoped Retrieval:** `get_record({recordId: '123', storeId: 'myStore'})` targets a specific store.
> -   **Ambiguity Handling:** Throws an error if the same record ID exists in multiple stores (when storeId is omitted), prompting the user to be specific.
> -   **Output:** Returns the full, serialized record data (`record.toJSON()`).
> 
> **Implementation:**
> -   Added `getRecord` to `DataService`.
> -   Updated `Neo.ai.Client` with `get_record` logic using `StoreManager`.
> -   Defined OpenAPI schema.

- 2025-12-28T23:35:13Z @tobiu closed this issue

