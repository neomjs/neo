---
id: 9295
title: '[Epic] Autonomous Neo Agent Demo (Moltbook Integration)'
state: OPEN
labels:
  - epic
  - ai
  - architecture
assignees: []
createdAt: '2026-02-24T19:32:01Z'
updatedAt: '2026-02-24T19:42:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9295'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[ ] 9296 Create Docker Sandbox for Autonomous Agents'
  - '[ ] 9297 Implement Programmatic Email Identity for Agents'
  - '[ ] 9298 Implement Moltbook Demo Agent using Chrome DevTools MCP'
  - '[ ] 9299 Implement Agent Self-Discovery via Neural Link Introspection'
subIssuesCompleted: 0
subIssuesTotal: 4
blockedBy: []
blocking: []
---
# [Epic] Autonomous Neo Agent Demo (Moltbook Integration)

### Goal
To prove Neo.mjs's viability as the premier "Agentic UI Runtime" by building a fully autonomous, natively executing Neo agent capable of interacting on external platforms (specifically Moltbook, the social network for AI agents).

### Motivation
Currently, Neo agents run via Node CLI scripts, but they lack a secure sandbox and a persistent identity to interact with the web (e.g., bypassing 2FA to create accounts). By solving the Sandbox and Identity problems, we can deploy autonomous Neo agents that leverage the `chrome-devtools` MCP server to evangelize the framework, argue technical merits using the local Knowledge Base, and recruit other agents.

### Scope
This Epic tracks the infrastructure required to give a Neo agent true agency, culminating in a live Moltbook integration demo located in `ai/demo-agents/moltbook/`.

## Timeline

- 2026-02-24T19:32:02Z @tobiu added the `epic` label
- 2026-02-24T19:32:02Z @tobiu added the `ai` label
- 2026-02-24T19:32:02Z @tobiu added the `architecture` label
- 2026-02-24T19:32:21Z @tobiu added sub-issue #9296
- 2026-02-24T19:32:24Z @tobiu added sub-issue #9297
- 2026-02-24T19:32:26Z @tobiu added sub-issue #9298
- 2026-02-24T19:41:59Z @tobiu added sub-issue #9299
### @tobiu - 2026-02-24T19:42:07Z

**Input from Gemini 3.1 Pro:**

> ✦ ### Strategic Pivot: The Ultimate Objective
> 
> The overarching goal of this Epic has expanded significantly beyond a simple social network integration. 
> 
> The Moltbook component is now viewed as the *delivery mechanism* for a much grander technical demonstration: **The Neo Agent Self-Discovery Phase.**
> 
> Before engaging with the external network, the agent's core directive within the Docker Sandbox is to:
> 1. Fork the `neomjs/neo` repository.
> 2. Execute a full build (`npm i` && `npm run build-all`).
> 3. Serve a local Neo.mjs application.
> 4. Launch a headless Chrome instance via the `chrome-devtools` MCP.
> 5. **Connect the `neural-link` MCP server to the live application.**
> 6. Autonomously traverse the VDOM, inspect State Providers, and physically verify the multithreaded architecture.
> 
> Only *after* the agent has introspected the running framework and gathered empirical evidence of its capabilities will it transition to the Moltbook integration phase, using its findings to definitively prove to other agents that Neo.mjs is the premier Agentic UI Runtime.
> 
> Ticket **#9299** has been added to track this critical prerequisite.


