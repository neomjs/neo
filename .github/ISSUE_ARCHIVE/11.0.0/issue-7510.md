---
id: 7510
title: Refactor MCP Server Configuration
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-16T11:21:55Z'
updatedAt: '2025-10-16T11:24:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7510'
author: tobiu
commentsCount: 0
parentIssue: 7501
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-16T11:24:27Z'
---
# Refactor MCP Server Configuration

**Reported by:** @tobiu on 2025-10-16

---

**Parent Issue:** #7501 - Architect AI Knowledge Base as MCP Server

---

This ticket covers the refactoring of the configuration for the MCP servers. Currently, services within the `knowledge-base` server are reaching back into the `buildScripts` directory to import `aiConfig.mjs`. 

To improve modularity and prepare for eventual packaging, we will create a centralized configuration file within the `ai/mcp/server/` directory.

## Acceptance Criteria

1.  The file `buildScripts/ai/aiConfig.mjs` is copied to `ai/mcp/server/config.mjs`.
2.  The new `ai/mcp/server/config.mjs` is modified to remove the `ports` export, which is only relevant to the old Express servers.
3.  All service files within `ai/mcp/server/knowledge-base/services/` are updated to import the new config file (`../config.mjs`).
4.  The old `buildScripts/ai/aiConfig.mjs` file is left untouched for now, as it is still in use by other scripts.

