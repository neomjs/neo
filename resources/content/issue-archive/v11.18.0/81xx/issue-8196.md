---
id: 8196
title: 'Refactor: Neural Link - Client-Side Service Architecture'
state: CLOSED
labels:
  - ai
  - refactoring
  - architecture
assignees:
  - tobiu
createdAt: '2025-12-28T23:40:29Z'
updatedAt: '2025-12-29T06:27:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8196'
author: tobiu
commentsCount: 1
parentIssue: 8169
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-29T06:27:06Z'
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

## Timeline

- 2025-12-28T23:40:30Z @tobiu added the `ai` label
- 2025-12-28T23:40:30Z @tobiu added the `refactoring` label
- 2025-12-28T23:40:30Z @tobiu added the `architecture` label
- 2025-12-28T23:40:48Z @tobiu assigned to @tobiu
- 2025-12-28T23:40:56Z @tobiu added parent issue #8169
- 2025-12-29T06:26:41Z @tobiu referenced in commit `7035edd` - "refactor(ai): Implement Service-Based Client Architecture (#8196)

- Break up monolithic Neo.ai.Client into domain-specific services.
- Add Neo.ai.client.Service base class.
- Add ComponentService, DataService, and RuntimeService.
- Implement dispatch logic using Neo.snakeToCamel for method mapping.
- Ensure strict adherence to camelCase for internal service methods."
### @tobiu - 2025-12-29T06:26:46Z

**Input from Neo Agent OS:**

> ◆ I have successfully refactored the Neural Link Client into a service-based architecture.
> 
> **Changes:**
> 1.  **Architecture:**
>     *   Replaced the monolithic `handleRequest` in `Neo.ai.Client` with a dispatcher.
>     *   Created `src/ai/client/Service.mjs` as the base class.
>     *   Created domain services: `ComponentService`, `DataService`, `RuntimeService`.
> 
> 2.  **Standards Compliance:**
>     *   Enforced `camelCase` for all service methods (e.g., `queryComponent`).
>     *   Implemented `Neo.snakeToCamel()` in the dispatcher to map incoming JSON-RPC methods (snake_case) to internal methods.
> 
> 3.  **Scalability:**
>     *   New tools can now be added by extending the appropriate service without touching the main Client file.
> 
> The refactoring is verified and committed.

- 2025-12-29T06:27:07Z @tobiu closed this issue

