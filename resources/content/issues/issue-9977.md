---
id: 9977
title: 'fix: MCP Infrastructure Stability — Stdout Pollution, Crash Recovery, & Triage Mandate'
state: CLOSED
labels:
  - bug
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-13T16:22:15Z'
updatedAt: '2026-04-13T22:31:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9977'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-13T16:35:06Z'
---
# fix: MCP Infrastructure Stability — Stdout Pollution, Crash Recovery, & Triage Mandate

## Summary
This ticket formalizes critical infrastructure stability patches discovered during a localized breakdown of the Memory Core and Neural Link MCP servers. The standard JSON-RPC `stdio` transport was corrupting due to raw console output, and missing class methods were causing hard crashes during tool dispatch.

## Architectural Changes

### 1. The Infrastructure Triage Mandate (`AGENTS_STARTUP.md`)
Previously, agents were instructed to ignore `healthcheck` failures and proceed on a degraded Golden Path. This has been explicitly reversed. If core ecosystem servers fail, agents are now strictly mandated to immediately pivot into diagnostic and self-healing workflows. Executing roadmap tasks with a sick framework ecosystem is now forbidden.

### 2. Eliminating `stdout` JSON-RPC Corruption
The MCP standard transport relies on pure JSON over `stdout`. Services logging raw text via `console` directly break the client parsers:
- **`Memory Core / SessionService`**: Replaced `console.log` with `logger.info` inside the asynchronous Map-Reduce summarization pipeline.
- **`Neural Link / RecorderService`**: Imported the centralized `logger.mjs` and refactored all `console.error` and `console.warn` statements to route through the standard logger.

### 3. Neural Link Runtime Crash Recovery
- **`ConnectionService.mjs`**: Implemented the missing `getDefaultSessionId()` method. The `toolService.mjs` dispatch layer implicitly expected this method to exist to support auto-targeting. Its absence caused `ConnectionService.getDefaultSessionId is not a function` during any Neural Link tool execution where `sessionId` was omitted.

## Acceptance Criteria
- [x] All MCP servers respond with `healthy` via the `healthcheck` tool.
- [x] Zero `invalid character 'R' looking for beginning of value` JSON parse errors in MCP client logs.
- [x] Neural Link Bridge dual-connections (two independent Antigravity nodes) load strictly via `logger` trace outputs instead of raw stdout.

## Timeline

- 2026-04-13T16:22:16Z @tobiu added the `bug` label
- 2026-04-13T16:22:17Z @tobiu added the `ai` label
- 2026-04-13T16:22:17Z @tobiu added the `architecture` label
- 2026-04-13T16:22:49Z @tobiu referenced in commit `3351e52` - "fix: MCP Infrastructure Stability — Stdout Pollution & Crash Recovery (#9977)"
- 2026-04-13T16:23:01Z @tobiu cross-referenced by PR #9978
- 2026-04-13T16:35:06Z @tobiu closed this issue
- 2026-04-13T16:35:06Z @tobiu referenced in commit `4e9227c` - "fix: MCP Infrastructure Stability — Stdout Pollution & Crash Recovery (#9977) (#9978)"
- 2026-04-13T22:31:48Z @tobiu assigned to @tobiu

