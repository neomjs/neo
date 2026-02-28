---
id: 9102
title: Fix Memory Core MCP Server failing to load GEMINI_API_KEY from .env
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-02-11T14:11:20Z'
updatedAt: '2026-02-11T14:18:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9102'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-11T14:18:18Z'
---
# Fix Memory Core MCP Server failing to load GEMINI_API_KEY from .env

The Memory Core MCP server fails to detect the `GEMINI_API_KEY` even when present in the `.env` file. This regression prevents the server from accessing the API key required for summarization features.

The investigation reveals that the server entry point `ai/mcp/server/memory-core/mcp-stdio.mjs` does not import `dotenv/config`, relying entirely on the parent process to inject environment variables.

**Proposed Fix:**
Explicitly import `dotenv/config` in `ai/mcp/server/memory-core/mcp-stdio.mjs` to ensure local `.env` files are loaded regardless of the execution context.

## Timeline

- 2026-02-11T14:11:22Z @tobiu added the `bug` label
- 2026-02-11T14:11:22Z @tobiu added the `ai` label
- 2026-02-11T14:13:38Z @tobiu referenced in commit `a7cf3f1` - "fix(mcp): Memory Core now loads .env variables (#9102)"
- 2026-02-11T14:14:57Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-11T14:15:14Z

**Input from Gemini 3 Pro:**

> ✦ I have fixed the issue by adding `import 'dotenv/config'` to `ai/mcp/server/memory-core/mcp-stdio.mjs`. This ensures that the `.env` file is loaded at startup, making `GEMINI_API_KEY` available to the `HealthService` and `SessionService`.
> 
> I verified the fix by inspecting the file and confirming the `dotenv` import is now present.

- 2026-02-11T14:18:18Z @tobiu closed this issue

