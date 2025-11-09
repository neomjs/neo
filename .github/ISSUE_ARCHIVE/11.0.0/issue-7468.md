---
id: 7468
title: 'MCP Server: Relocate Memory API Specification'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-12T11:17:42Z'
updatedAt: '2025-10-12T11:18:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7468'
author: tobiu
commentsCount: 0
parentIssue: 7399
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-12T11:18:40Z'
---
# MCP Server: Relocate Memory API Specification

**Reported by:** @tobiu on 2025-10-12

---

**Parent Issue:** #7399 - Architect AI Tooling as a Model Context Protocol (MCP) Servers

---

This ticket is for improving the project's directory structure by relocating the OpenAPI specification for the Memory Core MCP server.

As part of the "Architect AI Tooling as a Model Context Protocol (MCP)" epic, we are creating a new, dedicated home for our AI servers under `ai/mcp/server/`. Previously, related files, including the OpenAPI specification, were located in the `buildScripts` directory.

The current location for the memory server's spec (`buildScripts/mcp/memory/openapi.yaml`) is now outdated and decoupled from the server's source code. To improve discoverability, maintainability, and logical grouping, this specification should be moved to live directly alongside the server implementation it describes.

## Acceptance Criteria

1.  The file `buildScripts/mcp/memory/openapi.yaml` must be moved to `ai/mcp/server/memory/openapi.yaml`.
2.  The original file at `buildScripts/mcp/memory/openapi.yaml` must be deleted.
3.  The directory `buildScripts/mcp/memory/` should be removed if it becomes empty after the move.

