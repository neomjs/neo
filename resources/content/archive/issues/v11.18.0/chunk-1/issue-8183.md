---
id: 8183
title: 'Feat: Neural Link - Data Store Inspection & Manager'
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T20:55:36Z'
updatedAt: '2025-12-28T23:04:00Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8183'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-28T23:04:00Z'
---
# Feat: Neural Link - Data Store Inspection & Manager

**Context:**
Agents need visibility into the application's data layer to debug issues. Currently, identifying and inspecting stores is difficult without a central registry.

**Scope:**

1.  **Create `Neo.manager.Store`:**
    -   A singleton manager that tracks all `Neo.data.Store` instances.
    -   Auto-register stores on creation, unregister on destruction.
    -   Support hierarchy lookup (parent/child stores via `source`).

2.  **Implement `DataService` (Neural Link):**
    -   Create `ai/mcp/server/neural-link/services/DataService.mjs`.

3.  **Implement `inspect_store(storeId)` Tool:**
    -   Returns: `count`, `filters` (serialized), `sorters`, `model` name, and a sample of records (limit configurable).

4.  **Implement `list_stores()` Tool:**
    -   Uses `Neo.manager.Store` to return a list of all active stores with basic metadata (id, model, count).

**Goal:** Provide comprehensive visibility into the application's data layer.

## Timeline

- 2025-12-28T20:55:37Z @tobiu added the `enhancement` label
- 2025-12-28T20:55:37Z @tobiu added the `ai` label
- 2025-12-28T20:55:37Z @tobiu added the `architecture` label
- 2025-12-28T20:55:44Z @tobiu added parent issue #8169
- 2025-12-28T23:00:52Z @tobiu referenced in commit `7b50bfc` - "feat(ai): Implement Data Store Inspection (#8183)

- Create `Neo.manager.Store` to track store instances.
- Update `Neo.data.Store` to auto-register with the new manager.
- Add `inspect_store` and `list_stores` tools to Neural Link MCP.
- Implement data service handling in `Neo.ai.Client`.
- Refine `inspect_store` to correctly serialize record data."
- 2025-12-28T23:02:11Z @tobiu referenced in commit `e386a52` - "feat(ai): Implement Data Store Inspection (#8183)

- Create `Neo.manager.Store` to track store instances.
- Update `Neo.data.Store` to auto-register with the new manager.
- Add `inspect_store` and `list_stores` tools to Neural Link MCP.
- Implement data service handling in `Neo.ai.Client`.
- Refine `inspect_store` to correctly serialize record data."
### @tobiu - 2025-12-28T23:03:34Z

**Input from Gemini:**

> ✦ I have implemented the Data Store Inspection features.
> 
> **Changes:**
> 1.  **New Manager:** `Neo.manager.Store` (Singleton) tracks all active store instances.
> 2.  **Core Update:** `Neo.data.Store` now registers/unregisters with the manager automatically.
> 3.  **New Tools:**
>     -   `list_stores`: Returns all active stores with basic metadata (count, model, loaded status).
>     -   `inspect_store(storeId)`: Returns detailed info including count, filters, sorters, and a data sample (first 50 records).
>     -   **Refinement:** `inspect_store` uses `store.getAt(i).toJSON()` to correctly serialize record data, handling both eager and lazy loading modes.
> 
> This gives agents visibility into the application's data layer.

- 2025-12-28T23:03:49Z @tobiu assigned to @tobiu
- 2025-12-28T23:04:00Z @tobiu closed this issue

