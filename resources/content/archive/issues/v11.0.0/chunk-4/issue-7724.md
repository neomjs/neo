---
id: 7724
title: 'Docs: Update Agent-Agnostic MCP Config Guide for SDK Architecture'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-08T12:08:09Z'
updatedAt: '2025-11-08T12:12:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7724'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-08T12:12:03Z'
---
# Docs: Update Agent-Agnostic MCP Config Guide for SDK Architecture

The `learn/guides/ai/AgentAgnosticMcpConfig.md` guide was significantly outdated. It described a manual, agent-driven process for discovering and managing MCP servers based on the now-deleted `.github/mcp-servers.json` file.

This guide has been completely updated to reflect the current architecture, which relies on the `@modelcontextprotocol/sdk` and a client-managed lifecycle.

Key changes include:
-   **New Protocol:** The guide now explains the modern "Lifecycle Protocol," where the agent's client environment (e.g., Gemini CLI) is responsible for launching servers via `command` and `args` from its local configuration (e.g., `.gemini/settings.json`).
-   **Updated Schema:** The `Server Definition` table has been updated to be a more comprehensive, conceptual schema that includes properties like `name`, `command`, `args`, `type`, and `instructions`, clarifying the purpose of each.
-   **SDK-First Architecture:** A new "Server-Side Implementation" section has been added to explain *why* the client configuration can be so simple. It details the roles of `StdioServerTransport`, `openapi.yaml` for tool definitions, and the generic `toolService.mjs`.
-   **Cleanup:** All obsolete sections describing the old implementation (e.g., `healthCheck` objects, `connection` objects, manual `fetch`/`spawn` examples) have been removed to avoid confusion.
-   **Content Restoration:** The valuable "See Also" section with relevant links was re-added.

The updated guide now accurately represents the current, more robust, and simplified SDK-based approach to MCP server integration.

## Timeline

- 2025-11-08T12:08:09Z @tobiu added the `documentation` label
- 2025-11-08T12:08:10Z @tobiu added the `ai` label
- 2025-11-08T12:08:26Z @tobiu assigned to @tobiu
- 2025-11-08T12:08:44Z @tobiu referenced in commit `7df1992` - "Docs: Update Agent-Agnostic MCP Config Guide for SDK Architecture #7724"
- 2025-11-08T12:12:03Z @tobiu closed this issue

