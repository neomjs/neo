---
id: 7723
title: Deprecate and remove `.github/mcp-servers.json`
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-08T11:32:57Z'
updatedAt: '2025-11-08T11:34:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7723'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-08T11:34:03Z'
---
# Deprecate and remove `.github/mcp-servers.json`

**Reported by:** @tobiu on 2025-11-08

The `.github/mcp-servers.json` file was created as an early attempt to define the Model Context Protocol (MCP) servers in an agent-agnostic way.

However, with the stabilization and formalization of the three core MCP servers (Knowledge Base, Memory Core, GitHub Workflow), the definitive and actively used configuration now resides in `.gemini/settings.json`. This file is tailored to the Gemini agent's specific startup and operational needs.

Maintaining the old `mcp-servers.json` file is no longer necessary and creates confusion, as it is outdated and does not reflect the current implementation. To streamline the repository and remove obsolete configuration, this file has been deleted.

Future integrations with other agents (e.g., Claude) can be handled by creating new, agent-specific configuration files as needed, rather than trying to maintain a single, generic file that doesn't fully serve any specific agent.

