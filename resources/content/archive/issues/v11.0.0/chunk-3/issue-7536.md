---
id: 7536
title: 'Epic: Integrate Neo.mjs Core into MCP Servers'
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-18T10:08:51Z'
updatedAt: '2025-10-19T23:25:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7536'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 7537 PoC: Refactor ChromaManager to a Neo.mjs Class'
  - '[x] 7538 Convert DatabaseLifecycleService to a Neo.mjs Class'
  - '[x] 7539 Improve isDbRunning() in DatabaseLifecycleService'
  - '[x] 7540 Convert dbService to DatabaseService Neo.mjs Class'
  - '[x] 7542 Convert healthService to HealthService Neo.mjs Class'
  - '[x] 7543 Convert memoryService to MemoryService Neo.mjs Class'
  - '[x] 7544 Convert sessionService to SessionService Neo.mjs Class'
  - '[x] 7545 Convert summaryService to SummaryService Neo.mjs Class'
  - '[x] 7546 Convert textEmbeddingService to TextEmbeddingService Neo.mjs Class'
  - '[x] 7547 Enhance DatabaseLifecycleService with Eventing'
  - '[x] 7549 Create ChromaManager and Adjust KB Server Entry Point'
  - '[x] 7550 Convert databaseLifecycleService to DatabaseLifecycleService Neo.mjs Class'
  - '[x] 7551 Convert databaseService to DatabaseService Neo.mjs Class'
  - '[x] 7552 Convert documentService to DocumentService Neo.mjs Class'
  - '[x] 7553 Refactor HealthService to Match Superior Memory Core Pattern'
  - '[x] 7554 Convert queryService to QueryService Neo.mjs Class'
  - '[x] 7555 Centralize ChromaDB Client Warning Suppression in ChromaManager'
  - '[x] 7556 Convert GitHub Workflow healthService to HealthService Neo.mjs Class'
  - '[x] 7557 Convert issueService to IssueService Neo.mjs Class'
  - '[x] 7558 Convert labelService to LabelService Neo.mjs Class'
  - '[x] 7559 Convert pullRequestService to PullRequestService Neo.mjs Class'
  - '[x] 7560 Centralize GitHub Workflow Configuration'
  - '[x] 7561 Refactor AI Config for Server-Specific Namespacing'
  - '[x] 7562 Refactor MCP Service ClassNames to Use Full Server Names'
  - '[x] 7563 Standardize ChromaDB Collection Naming Convention'
subIssuesCompleted: 25
subIssuesTotal: 25
blockedBy: []
blocking: []
closedAt: '2025-10-19T23:25:22Z'
---
# Epic: Integrate Neo.mjs Core into MCP Servers

## Overview

The current MCP (Model Context Protocol) servers are built with plain JavaScript modules, exporting functions that act as service handlers. While functional, this approach misses an opportunity to leverage the power and structure of the Neo.mjs core itself.

This epic outlines the plan to refactor the MCP server architecture to use the Neo.mjs class system (`Neo.core.Base`). By converting our services into singleton classes, we can take advantage of the framework's config system, lifecycle methods, mixins, and overall consistency. This will not only improve the maintainability and scalability of our servers but also serve as a powerful demonstration of Neo's capabilities on the backend.

## Key Requirements
-   Refactor all MCP server services (e.g., `healthService`, `databaseLifecycleService`, `chromaManager`) into singleton classes extending `Neo.core.Base`.
-   Utilize the Neo config system for service configurations.
-   Update the `toolService.mjs` to seamlessly integrate with class-based services.
-   Ensure the new architecture is robust, maintainable, and well-documented.

## Design Rationale & Strategy

-   **Architectural Approach:** The core strategy is to adopt a class-based architecture for all services. This provides a consistent and scalable foundation. Instead of exporting individual functions, each service will be a self-contained, instantiable class.
-   **Proof of Concept (PoC):** We will start with a PoC to validate the approach before a full-scale refactoring. The `ChromaManager` is selected as the ideal candidate for the PoC because it has state (e.g., `client`, `connected`), a clear lifecycle (`connect`/`disconnect`), and could benefit from reactive configs.
-   **Incremental Migration:** After a successful PoC, the remaining services will be migrated incrementally. The `toolService.mjs` will be enhanced to support both the old function-based and the new class-based services during the transition period, if necessary.

## Phase 1: Proof of Concept with ChromaManager
**Status: To Do**

The goal of this phase is to refactor `ai/mcp/server/memory-core/services/chromaManager.mjs` to use the Neo class system and prove the viability of this architecture.

1.  **Refactor `ChromaManager`:**
    -   Convert `chromaManager.mjs` from an object literal exporting functions into a `ChromaManager` class extending `Neo.core.Base`.
    -   Configure it as a singleton.
    -   Move state variables (like `client`) into the config system (e.g., `client_`).
    -   Convert functions (`getMemoryCollection`, `getSummaryCollection`) into class methods.
    -   Use lifecycle hooks like `onConstructed` for initialization logic (e.g., creating the ChromaDB client).

2.  **Integration:**
    -   Initialize the Neo core in the `memory-core` server's entry point (`mcp-stdio.mjs`).
    -   Update the service handlers that depend on `chromaManager` to get the singleton instance and call its methods.

3.  **Evaluation:**
    -   Assess the refactored `ChromaManager`. Does the class-based approach feel natural and beneficial? Or does it feel like unnecessary overhead?
    -   If the PoC is successful, it provides a strong signal to proceed with the full migration.

## Phase 2: Migrate All Services
**Status: To Do**

This phase involves refactoring all remaining services in all three MCP servers (`knowledge-base`, `memory-core`, `github-workflow`).

1.  **Refactor Services:**
    -   Convert all service modules to Neo singleton classes.
    -   Apply the patterns established in the `ChromaManager` PoC.

2.  **Documentation:**
    -   Update the project's documentation to reflect the new class-based architecture for MCP servers.

## Timeline

- 2025-10-18T10:08:51Z @tobiu assigned to @tobiu
- 2025-10-18T10:08:53Z @tobiu added the `epic` label
- 2025-10-18T10:08:53Z @tobiu added the `ai` label
- 2025-10-18T10:14:15Z @tobiu added sub-issue #7537
- 2025-10-18T10:14:49Z @tobiu referenced in commit `6028d86` - "#7536 ticket as md files"
- 2025-10-18T11:23:55Z @tobiu referenced in commit `c9da77e` - "#7536 epic md file update"
- 2025-10-18T11:28:09Z @tobiu added sub-issue #7538
- 2025-10-18T11:51:18Z @tobiu added sub-issue #7539
- 2025-10-18T12:03:29Z @tobiu added sub-issue #7540
- 2025-10-18T12:49:48Z @tobiu added sub-issue #7542
- 2025-10-18T13:06:34Z @tobiu added sub-issue #7543
- 2025-10-18T13:23:17Z @tobiu added sub-issue #7544
- 2025-10-18T13:39:26Z @tobiu referenced in commit `32f858d` - "#7536 healthService.mjs => HealthService.mjs"
- 2025-10-18T13:44:03Z @tobiu added sub-issue #7545
- 2025-10-18T13:53:59Z @tobiu added sub-issue #7546
- 2025-10-18T14:02:57Z @tobiu referenced in commit `3c28197` - "#7536 replacing onConstructed() with construct() in services where needed"
- 2025-10-18T14:42:40Z @tobiu added sub-issue #7547
- 2025-10-19T21:07:14Z @tobiu added sub-issue #7549
- 2025-10-19T21:17:23Z @tobiu added sub-issue #7550
- 2025-10-19T21:19:11Z @tobiu added sub-issue #7551
- 2025-10-19T21:48:50Z @tobiu added sub-issue #7552
- 2025-10-19T21:54:40Z @tobiu added sub-issue #7553
- 2025-10-19T22:08:38Z @tobiu added sub-issue #7554
- 2025-10-19T22:17:02Z @tobiu added sub-issue #7555
- 2025-10-19T22:19:26Z @tobiu referenced in commit `33ee24b` - "#7536 knowledge base => toolService.mjs formatting"
- 2025-10-19T22:23:52Z @tobiu added sub-issue #7556
- 2025-10-19T22:35:59Z @tobiu added sub-issue #7557
- 2025-10-19T22:43:29Z @tobiu added sub-issue #7558
- 2025-10-19T22:57:16Z @tobiu added sub-issue #7559
- 2025-10-19T22:59:33Z @tobiu referenced in commit `2df1067` - "#7536 github-workflow/mcp-stdio.mjs: neo imports"
- 2025-10-19T23:00:25Z @tobiu referenced in commit `c2311f9` - "#7536 github-workflow/services/toolService.mjs: formatting"
- 2025-10-19T23:04:22Z @tobiu added sub-issue #7560
- 2025-10-19T23:09:12Z @tobiu added sub-issue #7561
- 2025-10-19T23:18:42Z @tobiu added sub-issue #7562
- 2025-10-19T23:24:13Z @tobiu added sub-issue #7563
### @tobiu - 2025-10-19T23:25:22Z

resolved.

- 2025-10-19T23:25:22Z @tobiu closed this issue

