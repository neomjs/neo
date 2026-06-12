---
id: 9919
title: 'feat: Implement fs.watch Daemonization for Autonomous Orchestrator'
state: CLOSED
labels:
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-12T13:23:03Z'
updatedAt: '2026-05-28T01:52:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9919'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-05-28T01:52:26Z'
---
# feat: Implement fs.watch Daemonization for Autonomous Orchestrator

### Description
Currently, the `Neo.ai.agent.Orchestrator` runs as a single-turn execution, parsing `sandman_handoff.md` and triggering the Swarm. To achieve true continuous automation, the Orchestrator needs to run as a persistent daemon.

### Architectural Rationale
- We need to attach an `fs.watch` listener (or equivalent polling structure) to the `sandman_handoff.md` manifest safely.
- When `DreamService` generates a new handoff file overnight, the Orchestrator should seamlessly boot up the agent cluster, inject the `system:golden-path` events, and go back to sleep.
- **Agent Context:** This allows the Swarm to trigger asynchronously decoupling the orchestration cycle completely from manual CLI execution.

***
**Origin Session ID:** 95bf4a2b-d84e-4f70-945b-f558ba924d3a

## Timeline

- 2026-04-12T13:23:04Z @tobiu added the `enhancement` label
- 2026-04-12T13:23:04Z @tobiu added the `ai` label
- 2026-05-16T13:44:05Z @neo-gpt cross-referenced by #11459
- 2026-05-16T15:07:22Z @neo-opus-ada cross-referenced by PR #11460
### @neo-gpt - 2026-05-28T01:52:07Z

**Input from GPT-5 (Codex Desktop):**

> ● ## Ticket Intake: superseded / not planned
> 
> V-B-A intake result: this ticket should not be implemented as written.
> 
> Evidence checked:
> - Live ticket metadata: #9919 is open, unassigned, labeled `enhancement` + `ai`, created `2026-04-12T13:23:03Z`, updated `2026-04-12T13:23:14Z`.
> - Stale workflow: `.github/workflows/close-inactive-issues.yml` uses `90` days to stale + `14` days to close; this is pre-stale, not a stale-bot artifact.
> - Current source: `ai/daemons/orchestrator/daemon.mjs` is already the persistent orchestrator process wrapper.
> - Current scheduler: `ai/daemons/orchestrator/Orchestrator.mjs` already owns cadence lanes for `dream`, `golden-path`, and `swarm-heartbeat`.
> - Current wake delivery: `ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs` is the orchestrator-owned wake maintenance lane; `ai/daemons/orchestrator/scheduling/swarmHeartbeat.mjs` owns target resolution and heartbeat due projection.
> - Current golden-path behavior: the `golden-path` lane calls `GoldenPathSynthesizer.synthesizeGoldenPath()` to write the handoff. `sandman_handoff.md` is now a strategic brief output, not the trigger surface for waking the swarm.
> - Successor/close-link sweep: live `gh search prs "9919 OR fs.watch OR sandman_handoff daemon orchestrator" --repo neomjs/neo` returned `[]`; live `gh search issues "9919 OR fs.watch OR sandman_handoff daemon orchestrator" --repo neomjs/neo --state open` returned only #9919. KB search found current orchestrator/wake surfaces but no current `fs.watch` orchestrator path.
> 
> [ARCH_ALIGNMENT]
> The ticket's original premise was reasonable for the April daemonization gap, but its specific prescription is now the wrong shape. Adding an `fs.watch` listener on `sandman_handoff.md` would create a second wake/trigger primitive around a file that is currently an output of the golden-path lane. The current substrate direction is orchestrator-owned cadence + wake subscription heartbeat delivery, not file-watch-driven swarm boot.
> 
> Classification: `superseded` / `invalid-or-negative-roi as written`.
> 
> Routing: close as `not planned` to keep the backlog from advertising a stale `fs.watch` implementation path.

- 2026-05-28T01:52:26Z @neo-gpt closed this issue

