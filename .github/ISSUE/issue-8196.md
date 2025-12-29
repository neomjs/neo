---
id: 8196
title: 'Refactor: Neural Link - Client-Side Service Architecture'
state: OPEN
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T23:40:29Z'
updatedAt: '2025-12-28T23:40:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8196'
author: tobiu
commentsCount: 0
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Refactor: Neural Link - Client-Side Service Architecture

**Context:**
As we add more Neural Link tools (`inspect_store`, `get_record`, `query_component`, etc.), the `src/ai/Client.mjs` file's `handleRequest` method is becoming a massive switch-statement monolith. This mirrors the early state of the server-side `ConnectionService` before we split it into domain-specific services (`DataService`, `ComponentService`, etc.).

**Problem:**
-   **Maintenance Risk:** A single file handling all domain logic (data, UI, navigation, inspection) is hard to read and maintain.
-   **Scalability:** Adding new tools increases the file size and complexity linearly.
-   **Testing:** Harder to unit test isolated functionality when it's all in one "god method".

**Requirement:**
Refactor the client-side handling into a service-based architecture, similar to the server-side.

**Proposed Architecture:**
1.  **`Neo.ai.client.Service` (Base Class):** Base class for client-side services.
2.  **Domain Services:**
    -   `Neo.ai.client.ComponentService`: Handles `query_component`, `get_component_tree`, etc.
    -   `Neo.ai.client.DataService`: Handles `inspect_store`, `get_record`, `list_stores`.
    -   `Neo.ai.client.RuntimeService`: Handles `reload_page`, `get_window_info`.
3.  **Service Registry:** `Neo.ai.Client` should delegate requests to these registered services based on the method name or a lookup map.

**Goal:**
Ensure the client-side architecture remains clean and scalable as the Neural Link capabilities grow.

## Activity Log

- 2025-12-28 @tobiu added the `ai` label
- 2025-12-28 @tobiu added the `refactoring` label
- 2025-12-28 @tobiu added the `architecture` label
- 2025-12-28 @tobiu assigned to @tobiu
- 2025-12-28 @tobiu added parent issue #8169

