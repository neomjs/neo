# Epic: Integrate Neo.mjs Core into MCP Servers

GH ticket id: #7536

**Assignee:** tobiu
**Status:** To Do

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

## Phase 2: Enhance `toolService.mjs`
**Status: To Do**

This phase will focus on making the `toolService` class-aware.

1.  **Update `toolService`:**
    -   Modify `toolService.mjs` to recognize when a handler is a method on a Neo singleton.
    -   The service mapping will be updated to store class names instead of function references.
    -   The `callTool` function will be updated to get the singleton instance and call the method.

## Phase 3: Migrate All Services
**Status: To Do**

This phase involves refactoring all remaining services in all three MCP servers (`knowledge-base`, `memory-core`, `github-workflow`).

1.  **Refactor Services:**
    -   Convert all service modules to Neo singleton classes.
    -   Apply the patterns established in the `ChromaManager` PoC.

2.  **Documentation:**
    -   Update the project's documentation to reflect the new class-based architecture for MCP servers.
