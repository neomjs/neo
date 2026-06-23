---
id: 9298
title: '[Blocked] Moltbook demo agent after API and identity research'
state: OPEN
labels:
  - enhancement
  - ai
  - needs-re-triage
  - not-code-ready
assignees: []
createdAt: '2026-02-24T19:32:14Z'
updatedAt: '2026-06-23T03:36:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9298'
author: tobiu
commentsCount: 3
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy:
  - '[ ] 9297 External-agent identity/auth boundary after Moltbook API decision'
  - '[ ] 9915 [Blocked Research] Moltbook API / identity feasibility for Neo AgentOS demo'
blocking: []
---
# [Blocked] Moltbook demo agent after API and identity research

# Moltbook demo agent after API and identity research

## Current Reality (2026-06-03)

This ticket remains valid only as a post-research implementation lane.

- #9915 is the current authority for Moltbook API/MCP feasibility.
- #9297 owns the identity/auth decision after #9915 resolves the real platform shape.
- PR #9901 was closed unmerged because Neural Link-to-Moltbook was the wrong substrate: Moltbook is external, not a Neo runtime surface.
- No `ai/demo-agents/moltbook/` implementation exists in the repository.

## Current Verdict

Keep open, blocked by #9915 and #9297.

Do not implement from the old Chrome DevTools / Programmatic Identity body. Moltbook is external; Neural Link is not applicable to Moltbook itself.

## Re-entry Gate

Before implementation:

- #9915 resolves supported Moltbook API/auth/integration shape or declares the path negative ROI.
- #9297 is rewritten or closed with a concrete identity/auth decision.
- The chosen implementation names the authoritative substrate, for example a dedicated `neo-mjs-moltbook` MCP server if official API support is confirmed.

If #9915 finds no viable supported API/auth path, close this ticket as superseded/negative ROI.

## Out of Scope

- Building `ai/demo-agents/moltbook/Agent.mjs` against the old body.
- Treating Chrome DevTools automation as the default before #9915 completes.
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
- 2026-05-27T22:15:12Z @tobiu removed the `agent-task:blocked` label
- 2026-05-28T05:24:31Z @neo-gpt marked this issue as being blocked by #9915
- 2026-05-28T05:24:41Z @neo-gpt marked this issue as being blocked by #9297
- 2026-06-03T08:05:17Z @neo-gpt cross-referenced by #9915
- 2026-06-03T08:05:27Z @neo-gpt removed the `needs-re-triage` label
- 2026-06-23T03:36:51Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:36:51Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-23T03:36:58Z

[ARCH_ALIGNMENT]

Label sync only: this ticket is already retargeted in the body as blocked by #9915 and #9297, and the 2026-05-26 comment records the same verdict: not claimable until the supported Moltbook API/auth path is defined.

Applied `not-code-ready` + `needs-re-triage` so the backlog survey matches the ticket's current public state. No implementation intake started.


