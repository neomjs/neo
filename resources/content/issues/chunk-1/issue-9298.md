---
id: 9298
title: '[Blocked] Moltbook demo agent after API and identity research'
state: OPEN
labels:
  - enhancement
  - ai
  - 'agent-task:blocked'
  - needs-re-triage
assignees: []
createdAt: '2026-02-24T19:32:14Z'
updatedAt: '2026-05-26T03:14:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9298'
author: tobiu
commentsCount: 2
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# [Blocked] Moltbook demo agent after API and identity research

### Problem
We still want an end-to-end Moltbook demo agent that proves Neo AgentOS can operate against an external agent network with Memory Core / Knowledge Base context.

### Current Reality (2026-05-26)
Verified live before this rewrite:
- #9915 is the current authority for Moltbook API/MCP feasibility. It says Moltbook is external, not a Neo VDOM app, and asks for API payload research plus a possible dedicated `neo-mjs-moltbook` MCP server abstraction.
- #9297 is blocked/stale-shape and needs an explicit identity/auth decision before an agent can autonomously sign up or post.
- PR #9901 was closed unmerged after review because the Neural Link-to-Moltbook route was wrong-shape: Moltbook is not a Neo runtime surface.
- No `ai/demo-agents/moltbook/` implementation exists in the repository.

The old Chrome DevTools MCP / Programmatic Identity implementation path is not claimable as-is. Moltbook is external, not a Neo runtime surface; Neural Link is not applicable to Moltbook itself.

### Next Valid Pickup
Keep this issue open as a post-research implementation ticket only.

Acceptance gate before implementation:
- #9915 resolves supported Moltbook API/auth/integration shape.
- #9297 is rewritten or closed with a concrete identity/auth decision.
- The chosen implementation path names the authoritative integration substrate, e.g. a dedicated `neo-mjs-moltbook` MCP server if #9915 confirms API support.
- If #9915 finds no viable supported API/auth path, close this ticket as superseded/negative ROI.

### Out of Scope
- Building `ai/demo-agents/moltbook/Agent.mjs` against the old body.
- Treating Chrome DevTools automation as the default path before #9915 completes.
- Using Neural Link to introspect Moltbook.

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

- 2026-05-26T03:14:08Z @neo-gpt changed title from **Implement Moltbook Demo Agent using Chrome DevTools MCP** to **[Blocked] Moltbook demo agent after API and identity research**
### @neo-gpt - 2026-05-26T03:14:18Z

Retargeted this ticket to current reality instead of closing it: the original implementation details are stale, but the Moltbook demo-agent intent still has value after #9915 and #9297 resolve.

Verified before update:
- #9915 is the current authority for Moltbook API/MCP feasibility.
- #9297 is blocked/stale-shape on identity/auth.
- #9901 was closed unmerged because Neural Link-to-Moltbook was the wrong substrate.
- No `ai/demo-agents/moltbook/` implementation exists.

Current routing: blocked / needs re-triage, and not claimable until #9915 defines the supported integration path.

- 2026-05-26T03:14:25Z @neo-gpt added the `agent-task:blocked` label
- 2026-05-26T03:14:25Z @neo-gpt added the `needs-re-triage` label
- 2026-05-26T03:23:38Z @neo-gpt cross-referenced by #9296
- 2026-05-26T03:32:54Z @neo-gpt cross-referenced by #9295

