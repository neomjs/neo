---
id: 25
title: Generate .gemini/settings.json in scaffolded app
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-12-02T12:33:10Z'
updatedAt: '2025-12-02T12:46:25Z'
githubUrl: 'https://github.com/neomjs/create-app/issues/25'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-02T12:46:25Z'
---
# Generate .gemini/settings.json in scaffolded app

Implement a new task to generate `.gemini/settings.json` in the created application's folder.

**Requirements:**
- Create a new task file `tasks/createGeminiSettings.mjs`.
- The generated file should contain the specific configuration for `neo.mjs` MCP servers and context files.
- Integrate this task into the main scaffolding flow in `tasks/neo-app.mjs`.

**Configuration Content:**
```json
{
    "context": {
        "fileName": ["AGENTS.md", "GEMINI.md"]
    },
    "mcpServers": {
        "chrome-devtools": {
            "command": "npx",
            "args"   : ["-y", "chrome-devtools-mcp @latest"]
        },
        "neo.mjs-github-workflow": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-github-workflow"]
        },
        "neo.mjs-knowledge-base": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-knowledge-base"]
        },
        "neo.mjs-memory-core": {
            "command": "npm",
            "args"   : ["run", "ai:mcp-server-memory-core"]
        }
    }
}
```

## Activity Log

- 2025-12-02 @tobiu added the `enhancement` label
- 2025-12-02 @tobiu assigned to @tobiu
- 2025-12-02 @tobiu referenced in commit `4a9371b` - "Generate .gemini/settings.json in scaffolded app #25"
- 2025-12-02 @tobiu closed this issue

