---
title: Define Agent-Agnostic MCP Server Configuration
labels: enhancement, AI, hacktoberfest, good first issue, help wanted
---

GH ticket id: #7400

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

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **Define Agent-Agnostic MCP Server Configuration**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-define-agent-agnostic-mcp-config.md before we begin.
