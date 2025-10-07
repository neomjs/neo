---
title: Define Agent-Agnostic MCP Server Configuration
labels: enhancement, AI, architecture
---

GH ticket id: #XXXX

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 1
**Assignee:**
**Status:** To Do

## Description

To ensure our new Model Context Protocol (MCP) servers for AI tooling are accessible to a wide range of agents (e.g., from Google, Anthropic, etc.), we need a standardized, agent-agnostic configuration mechanism. Relying on a vendor-specific file like `.gemini/settings.json` is not a scalable or portable solution.

This task is to design a generic configuration file format and a discovery mechanism that any agent can use to find and connect to the locally running MCP servers (Knowledge and Memory).

## Acceptance Criteria

1.  A new, agent-agnostic configuration file, `.github/mcp-servers.json`, is designed.
2.  The configuration schema supports defining multiple MCP servers, including their name, port, and a command to start them.
3.  A clear discovery protocol is documented for agents, explaining how to locate and parse this new configuration file.
4.  The design is documented in a new guide within the `learn/guides/ai/` directory.
