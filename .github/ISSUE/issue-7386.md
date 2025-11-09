---
id: 7386
title: Configure MCP Server for Project
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-06T09:04:18Z'
updatedAt: '2025-10-06T09:05:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7386'
author: tobiu
commentsCount: 0
parentIssue: 7385
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-06T09:05:45Z'
---
# Configure MCP Server for Project

**Reported by:** @tobiu on 2025-10-06

---

**Parent Issue:** #7385 - 'Sighted' Agent - Chrome DevTools Integration

---

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

