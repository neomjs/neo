---
id: 8183
title: 'Feat: Neural Link - Data Store Inspection & Manager'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2025-12-28T20:55:36Z'
updatedAt: '2025-12-28T20:55:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8183'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
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

## Activity Log

- 2025-12-28 @tobiu added the `enhancement` label
- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu added parent issue #8169

