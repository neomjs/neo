---
id: 7654
title: 'Feat: Enhance Knowledge Base Health Service and Update OpenAPI Schema'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-25T19:16:25Z'
updatedAt: '2025-10-25T19:37:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7654'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-25T19:37:35Z'
---
# Feat: Enhance Knowledge Base Health Service and Update OpenAPI Schema

**Reported by:** @tobiu on 2025-10-25

This ticket documents the significant enhancement of the `HealthService` in the Knowledge Base MCP server, bringing it to a level of sophistication comparable to the Memory Core's `HealthService`. This includes adding caching, detailed status levels, API key checks, and recovery detection. The OpenAPI schema for the `healthcheck` tool has also been updated to reflect these changes.

**Motivation:**
The previous `HealthService` in the Knowledge Base server was basic, lacking features crucial for robust monitoring, diagnostics, and user guidance. By aligning its capabilities with the Memory Core's `HealthService`, we provide:
*   **Improved User Experience:** Clearer health status, detailed error messages, and recovery detection.
*   **Enhanced Performance:** Intelligent caching reduces redundant calls to ChromaDB.
*   **Better Diagnostics:** Comprehensive health payload for easier debugging and understanding of server status.
*   **Consistency:** Standardized health reporting across different MCP servers.

**Changes Implemented:**

1.  **`ai/mcp/server/knowledge-base/services/HealthService.mjs` Refactoring:**
    *   Copied and adapted the robust `HealthService` implementation from `memory-core`.
    *   Added caching mechanisms (`#cachedHealth`, `#lastCheckTime`, `#cacheDuration`, `#previousStatus`).
    *   Implemented detailed helper methods: `#checkChromaConnection()`, `#checkCollections()` (adapted for a single knowledge base collection), `#checkApiKeyConfigured()`.
    *   Introduced a comprehensive `#performHealthCheck()` method to orchestrate checks and build a detailed status payload.
    *   Refactored the public `healthcheck()` method to include caching and recovery detection logic.
    *   Added an `ensureHealthy()` method for fail-fast behavior in tool invocations.
    *   Adapted all logic and messages to reflect the "Knowledge Base" context and single collection.
    *   Removed `startupSummarizationStatus` and `recordStartupSummarization` as they are not applicable.

2.  **`ai/mcp/server/knowledge-base/openapi.yaml` Update:**
    *   The `HealthCheckResponse` schema has been updated to reflect the new, detailed output structure of the `healthcheck` tool. This includes properties for `timestamp`, `database.connection.collections.knowledgeBase`, `features.embedding`, and `details`.

This enhancement significantly improves the reliability and diagnostic capabilities of the Knowledge Base MCP server.

