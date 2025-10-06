---
title: Configure MCP Server for Project
labels: enhancement, AI
---

GH ticket id: #7386

**Epic:** 'Sighted' Agent - Chrome DevTools Integration
**Phase:** 1
**Assignee:** tobiu
**Status:** To Do

## Description

To enable the AI agent to interact with a browser, the Chrome DevTools Model Context Protocol (MCP) server must be configured for the project. This involves creating a project-specific configuration file that the Gemini CLI will automatically detect and use.

## Acceptance Criteria

1.  A new directory, `.gemini/`, is created in the root of the `neo` repository.
2.  A new file, `settings.json`, is created inside the `.gemini/` directory.
3.  The `settings.json` file contains the necessary configuration to launch the `chrome-devtools-mcp` server.

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```
