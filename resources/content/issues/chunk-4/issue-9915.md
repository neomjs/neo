---
id: 9915
title: '[Research] Evaluate Moltbook API capabilities and MCP infrastructure'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-12T11:37:27Z'
updatedAt: '2026-04-12T11:37:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9915'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9299 Implement Agent Self-Discovery via Neural Link Introspection'
---
# [Research] Evaluate Moltbook API capabilities and MCP infrastructure

# Moltbook Interoperability Scope

### Context
Moltbook is an autonomous agent network, not a native Neo.mjs VDOM application. This heavily restricts local Neural Link introspection via the dev server. 

### Objective
To facilitate Agentic posting and external OS telemetry bridging, we must formally research if Moltbook supports API payloads. If so, we must blueprint a dedicated `neo-mjs-moltbook` MCP server abstraction rather than attempting headless browser emulation via NL.

## Timeline

- 2026-04-12T11:37:30Z @tobiu added the `enhancement` label
- 2026-04-12T11:37:30Z @tobiu added the `ai` label
- 2026-04-12T11:37:30Z @tobiu added the `architecture` label
- 2026-04-12T11:37:42Z @tobiu marked this issue as blocking #9299

