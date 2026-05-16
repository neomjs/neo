---
id: 9298
title: Implement Moltbook Demo Agent using Chrome DevTools MCP
state: OPEN
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-02-24T19:32:14Z'
updatedAt: '2026-02-24T19:38:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9298'
author: tobiu
commentsCount: 1
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Implement Moltbook Demo Agent using Chrome DevTools MCP

### Problem
We need an end-to-end integration test of the Neo AI infrastructure (Orchestrator + Memory Core + Knowledge Base + Sandbox) proving it can operate autonomously on the web.

### Solution
Build `ai/demo-agents/moltbook/Agent.mjs`. 
- Extend `Neo.ai.Agent`.
- Connect to the `chrome-devtools` MCP server for web navigation and interaction.
- Utilize the `ai/services.mjs` SDK to bypass MCP serialization for fast, direct access to ChromaDB (Memory/Knowledge).
- Utilize the new Programmatic Identity to autonomously sign up for moltbook.com, read posts, and reply with technical context sourced from the Neo.mjs knowledge base.

## Timeline

- 2026-02-24T19:32:16Z @tobiu added the `enhancement` label
- 2026-02-24T19:32:16Z @tobiu added the `ai` label
- 2026-02-24T19:32:26Z @tobiu added parent issue #9295
### @tobiu - 2026-02-24T19:38:13Z

**Input from Gemini 3.1 Pro:**

> ✦ ### Architectural Context: Connecting to Chrome DevTools
> 
> For the implementation of this agent, we do **not** need to build a custom Playwright bridge or a native Neo MCP server for browser automation. 
> 
> Because the `Neo.ai.mcp.client.Client` acts as a generic wrapper around the official `@modelcontextprotocol/sdk`, it can spawn external MCP servers via `npx` just as easily as it spawns our local Node.js scripts.
> 
> To grant the Orchestrator's `Loop` full control over a headless browser (including the 28 native tools for navigation, clicking, form filling, and DOM evaluation), we simply need to append the official `chrome-devtools-mcp` server to the client configuration (e.g., in `ai/mcp/client/config.mjs` or a dedicated config file for the Moltbook agent):
> 
> ```json
> {
>   "mcpServers": {
>     "chrome-devtools": {
>       "command": "npx",
>       "args": [
>         "-y",
>         "@modelcontextprotocol/server-puppeteer",
>         "chrome-devtools-mcp@latest",
>         "--channel=canary",
>         "--headless=true",
>         "--isolated=true"
>       ]
>     }
>   }
> }
> ```
> *(Note: Ensure the exact package name/args match the current official MCP Puppeteer/DevTools release at the time of implementation).*
> 
> This provides the agent with the necessary "hands and eyes" to interact with the external Moltbook platform while preserving the `neural-link` MCP server for our internal, deep-introspection pairing tasks.


