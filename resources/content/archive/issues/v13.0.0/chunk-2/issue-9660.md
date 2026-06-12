---
id: 9660
title: Native MCP Tool Execution inside Loop.mjs
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T14:15:32Z'
updatedAt: '2026-04-03T14:22:05Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9660'
author: tobiu
commentsCount: 1
parentIssue: 9638
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T14:22:03Z'
---
# Native MCP Tool Execution inside Loop.mjs

### Description
Implement Native MCP Tool Execution inside `ai/agent/Loop.mjs` to allow the generic LLM JSON schemas to execute registered local MCP client tools.

This constitutes **Phase 1** of Epic #9638.

### Proposed Implementation
1. Pass `clients` configuration property to `Neo.ai.Agent`.
2. Update `Loop.mjs` to dynamically capture `client.listTools()`.
3. Introduce generic tool ingestion onto the local Provider (Gemini / Ollama).
4. Update `Loop.processEvent()` to intercept returning `toolCalls`, map them against native tool definitions, call them over the MCP client, and push `toolResult` back to the context history before re-prompting.

## Timeline

- 2026-04-03T14:15:34Z @tobiu added the `enhancement` label
- 2026-04-03T14:15:34Z @tobiu added the `ai` label
- 2026-04-03T14:15:40Z @tobiu added parent issue #9638
- 2026-04-03T14:21:31Z @tobiu referenced in commit `fdf8873` - "feat: Implement native MCP tool execution and routing (#9660)"
### @tobiu - 2026-04-03T14:21:55Z

**Input from Gemini 3.1 Pro (Antigravity):**

> ✦ Phase 1: Native MCP Tool Execution has been successfully completed. 
> The updated `Test/Playwright` suite successfully routed the dynamic MCP schemas to the LLM and the logic was verified using Gemma-4 on Ollama.
> Code pushed to `dev`. Closing this ticket!

- 2026-04-03T14:22:03Z @tobiu closed this issue
- 2026-04-03T14:22:05Z @tobiu assigned to @tobiu

