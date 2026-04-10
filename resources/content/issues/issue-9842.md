---
id: 9842
title: 'feat: Implement Autonomous Agent Orchestrator with Golden Path Directive Injection'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-10T07:16:08Z'
updatedAt: '2026-04-10T07:17:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9842'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking:
  - '[ ] 9843 feat: Implement Quantitative Reward Signal for Golden Path Edge Reinforcement'
  - '[ ] 9844 feat: Implement Safe Commit Pipeline for Autonomous Agent Execution'
---
# feat: Implement Autonomous Agent Orchestrator with Golden Path Directive Injection

## Problem (A2A Context — Claude Opus 4.6 via Antigravity)

The Neo.mjs Agent infrastructure (`ai/Agent.mjs`, `ai/agent/Loop.mjs`, `ai/agent/Scheduler.mjs`) implements a complete "Perceive → Reason → Act → Reflect" cognitive cycle with sub-agent delegation (Librarian, QA, Browser). The DreamService synthesizes a mathematically weighted Golden Path into `sandman_handoff.md`. However, **no orchestrator exists to connect them**.

The autonomous loop currently requires a human to:
1. Read the Golden Path
2. Formulate a directive
3. Inject it into the Scheduler
4. Start the Agent

This is the single highest-leverage gap. A trivial runner script transforms the architecture from "80% self-evolving" to "90% self-evolving."

## Solution

Create `buildScripts/ai/runAgent.mjs` — a headless runner that:

1. Parses `sandman_handoff.md` to extract the top-N Golden Path directives
2. Boots `Neo.ai.Agent` with the appropriate MCP server connections
3. Injects each directive as a `{type: 'system:golden-path', priority: 'high'}` event into the Scheduler
4. Starts `agent.loop.start()` and processes until the Scheduler is empty
5. Exits cleanly so a cron job / `setInterval` can restart it

**Key Design Constraints:**
- Must be runnable via `node buildScripts/ai/runAgent.mjs` (no browser required)
- Must parse the existing `sandman_handoff.md` format (markdown with numbered list)
- Must connect to `knowledge-base`, `file-system`, and `github-workflow` MCP servers
- Must support `--dry-run` flag that logs directives without executing
- Should set `maxSubAgentLifespan` to a conservative value (e.g., 20) for the first iteration
- Add a corresponding `npm run ai:agent` script to `package.json`

**Integration Point:** A separate cron/launchd plist or `while true; sleep 3600; do node buildScripts/ai/runAgent.mjs; done` wrapper is intentionally out of scope for this ticket — the runner should be a single idempotent execution.

## Architectural Context

- `ai/Agent.mjs` (L97-144): `initAsync()` connects MCP clients and boots the Loop
- `ai/agent/Loop.mjs` (L271-290): `tick()` polls `scheduler.next()` and processes events
- `ai/agent/Scheduler.mjs` (L43-54): `add()` accepts `{type, priority, data}` events
- `buildScripts/ai/runSandman.mjs`: Existing pattern for headless Neo.mjs daemon runners
- `ai/daemons/DreamService.mjs` (L1003-1012): Golden Path markdown format

## Avoided Pitfalls

- Do NOT implement the cron/scheduling layer — keep the runner idempotent
- Do NOT auto-commit without explicit `--auto-commit` flag (safety boundary)
- Do NOT bypass the Scheduler — always inject directives as events to maintain the priority queue semantics
- Parsing `sandman_handoff.md` should be defensive (regex-based, tolerant of format drift)

## Verification

- Unit test: `test/playwright/unit/ai/Orchestrator.spec.mjs`
  - Assert: Golden Path parsing extracts correct directives
  - Assert: Events are injected with correct priority
  - Assert: `--dry-run` produces output without executing tools

## Timeline

- 2026-04-10T07:16:09Z @tobiu added the `enhancement` label
- 2026-04-10T07:16:10Z @tobiu added the `ai` label
- 2026-04-10T07:16:10Z @tobiu added the `architecture` label
- 2026-04-10T07:17:15Z @tobiu cross-referenced by #9844
- 2026-04-10T07:17:43Z @tobiu assigned to @tobiu
- 2026-04-10T07:17:58Z @tobiu marked this issue as blocking #9844
- 2026-04-10T07:18:00Z @tobiu marked this issue as blocking #9843

