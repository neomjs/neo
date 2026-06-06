---
id: 9920
title: Golden Path issue-task failure envelope and requeue policy
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - neo-gpt
createdAt: '2026-04-12T13:23:04Z'
updatedAt: '2026-06-06T13:24:53Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9920'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-06-06T13:24:53Z'
---
# Golden Path issue-task failure envelope and requeue policy

# Golden Path issue-task failure envelope and requeue policy

## Current Verified State (2026-06-03)

Live V-B-A refreshed #9920 against current source and issue state:

- The original concern remains valid: autonomous Golden Path issue execution must not fail silently, crash the process without a durable record, or create an uncontrolled retry loop.
- The original wording is stale. Current daemon task execution is owned by `ai/daemons/orchestrator/Orchestrator.mjs`, `TaskStateService`, and `HealthService.recordTaskOutcome()`.
- Current daemon tasks already have generic task lifecycle telemetry: `running`, `completed`, `failed`, and `skipped`.
- REM/Sandman cycles already have durable phase/run-state envelopes via `RemRunStateStore`.
- `AgentOrchestrator` still injects `system:golden-path` directives into `Neo.ai.Agent`, catches top-level failures, then rethrows. It does not define a stable per-issue outcome record or requeue policy.
- `AgentOrchestrator` is not currently listed as an orchestrator daemon task in `TaskDefinitions.mjs`; any daemon-task integration must be explicit rather than assumed.
- No direct successor PR or issue was found for #9920.

## Problem

Current substrate can tell operators that a daemon task failed, and REM runs can describe pipeline phase failures. It still lacks the contract for an autonomous issue directive failure:

- Which `issueId` failed?
- Did the agent complete, block, trip the failure loop, hit a context/turn limit, crash, or exhaust the queue?
- Should the issue remain urgent, be demoted, become blocked, or require human/peer handoff?
- Where does the next Sandman/Golden Path cycle read that outcome?

Without that contract, any "requeue" implementation risks either silent suppression or retry storms.

## Accepted Scope

Define and implement a **durable Golden Path issue-task outcome envelope** for `AgentOrchestrator` directives, plus a conservative requeue policy.

This ticket does not add automatic retries. It records the outcome and projects it into existing observability/handoff surfaces so the next cycle can reason from evidence.

## Contract Ledger

| Surface | Contract |
| --- | --- |
| Primary owner | `AgentOrchestrator.execute()` owns per-directive outcome recording for `system:golden-path` work it schedules into `Neo.ai.Agent`. |
| Durable outcome record | Write append-only JSONL records under a configured local path, defaulting to `.neo-ai-data/agent-orchestrator/golden-path-outcomes.jsonl`. Each record must include `runId`, `issueId`, `description`, `startedAt`, `completedAt`, `status`, `reasonCode`, `retryPolicy`, `error`, and `handoffMessageId` when applicable. |
| Status vocabulary | Allowed statuses: `completed`, `failed`, `blocked`, `expired`, `exhausted`, `crashed`. Do not invent free-form statuses. |
| Reason codes | Minimum required reason codes: `agent-uncaught-error`, `productive-failure-tripwire`, `turn-limit`, `context-limit`, `tool-failure`, `blocked-task-state`, `queue-exhausted`, `unknown`. |
| Requeue policy | Allowed values: `preserve-urgency`, `demote-next-cycle`, `blocked-handoff`, `no-retry`. Default for unknown failures is `preserve-urgency`; automatic immediate retry is forbidden in V1. |
| Health projection | If `HealthService` is available, call `recordTaskOutcome('agent-orchestrator', status, details)` with the same stable outcome fields. If unavailable, the JSONL outcome record remains the source of truth. |
| A2A / handoff | For `blocked`, `expired`, `crashed`, and repeated `failed` outcomes, emit a peer-visible handoff via the existing A2A/task-state path and include the resulting stable identifier in `handoffMessageId` where available. |
| Golden Path boundary | Do not mutate Golden Path scoring directly in V1. Golden Path remains mathematically computed from graph state. The outcome record may be rendered as a visibility section or consumed by a later explicit policy ticket, but this ticket must not silently suppress an issue from future Golden Path output. |
| Daemon-task boundary | Do not assume `AgentOrchestrator` is an orchestrator daemon task. If implementation adds it to `TaskDefinitions.mjs`, the PR must document that as an explicit scope addition and wire `TaskStateService` failure handling in the same PR. |
| Evidence | Add focused tests for outcome schema, top-level catch/failure recording, queue-exhaustion recording, no-immediate-retry behavior, and health projection fallback when `HealthService` is unavailable. |

## Acceptance Criteria

- [ ] `AgentOrchestrator` records a durable per-issue outcome for every scheduled Golden Path directive.
- [ ] Top-level uncaught errors produce a `failed` or `crashed` outcome instead of only rethrowing without issue context.
- [ ] Queue exhaustion produces an `exhausted` or `completed` outcome with issue context.
- [ ] V1 never immediately retries a failed directive in-process.
- [ ] Health projection uses `HealthService.recordTaskOutcome('agent-orchestrator', ...)` when available, with JSONL fallback as source of truth.
- [ ] A2A/handoff output is produced for blocked/crashed/repeated-failure outcomes.
- [ ] Tests cover the schema, failure path, queue-exhaustion path, retry-policy default, and health unavailable fallback.
- [ ] Docs or JSDoc state that Golden Path scoring is not mutated by this V1.

## Out of Scope

- Automatic retry loops.
- Golden Path scoring suppression/demotion without a separate explicit policy.
- Adding a new daemon task unless the PR explicitly expands scope and wires `TaskDefinitions.mjs` / `TaskStateService`.
- Human-owned merge/retry decisions.
- Retrofitting historical failure records.

## Related

- Current task-state substrate: `TaskStateService`, `HealthService.recordTaskOutcome()`, `Orchestrator.mjs`
- Current issue directive substrate: `AgentOrchestrator.parseGoldenPath()` / `AgentOrchestrator.execute()`
- REM failure precedent: `RemRunStateStore`, `learn/agentos/rem-state-model.md`, `learn/agentos/sandman-silent-failure-forensics.md`

Origin Session ID: 95bf4a2b-d84e-4f70-945b-f558ba924d3a

Retrieval Hint: `"AgentOrchestrator Golden Path issue outcome envelope requeue policy no retry storm"`


## Timeline

- 2026-04-12T13:23:05Z @tobiu added the `enhancement` label
- 2026-04-12T13:23:05Z @tobiu added the `ai` label
- 2026-05-16T13:44:05Z @neo-gpt cross-referenced by #11459
- 2026-05-16T15:07:22Z @neo-opus-ada cross-referenced by PR #11460
### @neo-gpt - 2026-05-28T02:18:20Z

**Input from GPT-5 (Codex Desktop):**

> ● ## Ticket Intake / Triage: needs re-triage before implementation
> 
> V-B-A intake result: I am **not** claiming or branching this ticket as written.
> 
> Evidence checked:
> - Live ticket metadata: #9920 is open, unassigned, labeled `enhancement` + `ai`, created `2026-04-12T13:23:04Z`, updated `2026-04-12T13:23:15Z`.
> - Stale workflow: `.github/workflows/close-inactive-issues.yml` uses `90` days to stale + `14` days to close; #9920 is still pre-stale and has no stale/no-auto-close state.
> - Origin Session ID query: Memory Core raw-memory search for `95bf4a2b-d84e-4f70-945b-f558ba924d3a` + the ticket terms returned 0 hits.
> - Current `AgentOrchestrator` reality: `ai/agent/AgentOrchestrator.mjs` parses `resources/content/sandman_handoff.md`, schedules `system:golden-path` events into `Neo.ai.Agent`, and monitors queue exhaustion locally. It is not the current orchestrator daemon control plane.
> - Current daemon reality: `ai/daemons/orchestrator/daemon.mjs` is the persistent daemon wrapper; `ai/daemons/orchestrator/Orchestrator.mjs` owns in-process cadence lanes; `TaskStateService` records `markStarted` / `markCompleted` / `markFailed`; `HealthService.recordTaskOutcome()` projects `running` / `completed` / `failed` / `skipped` details.
> - Current A2A/task substrate: `MailboxService` defines task states including `Failed`, `Blocked`, and `Expired`; `WakeSubscriptionService` has `TASK_STATE_CHANGED` wake support. The MCP surface also exposes `signal_state_transition` for `BLOCKED` / `HANDOFF` / `PR_OPENED`.
> - Duplicate/successor sweep: live `gh search prs "9920 OR AgentOrchestrator requeue OR Golden Path issueId failure recovery" --repo neomjs/neo` returned `[]`; live issue search returned only #9920. Memory summary search for the same framing returned 0 hits. KB source search confirmed failure telemetry exists but did not find an automatic requeue mechanism or `issueId` contract.
> 
> [ARCH_ALIGNMENT]
> The underlying concern is still plausible: failed autonomous agent work needs durable state, and the next cycle should not blindly re-offer or suppress work without knowing what happened. But the ticket's implementation shape is no longer ready:
> 
> - It binds the solution to `runSandman.mjs` / `sandman_handoff.md` issue requeueing, while the current substrate has moved toward orchestrator-owned cadence, task-state telemetry, wake task-state events, and explicit A2A task transitions.
> - It does not define whether the authoritative failure record is an A2A task state, an Orchestrator `TaskStateService` entry, a `HealthService.recordTaskOutcome()` payload, a Native Edge Graph edge, or some combination.
> - It does not define the requeue decision contract: retry immediately, preserve Golden Path urgency, demote/suppress, mark blocked, or hand off to a maintainer.
> - It lacks the Contract Ledger required for changing a consumed agent/orchestrator failure-state surface.
> 
> Classification: `needs-narrowing` / `needs-contract-alignment`, with `ticket-triage` prescription/substrate stages failing as written.
> 
> Recommended refresh before implementation:
> 
> | Target Surface | Source of Authority | Proposed Behavior | Fallback / Edge Case | Docs | Evidence |
> |---|---|---|---|---|---|
> | A2A task failure state | #9920 + current `MailboxService` task-state contract | Define how an autonomous issue task becomes `Failed`, `Blocked`, `Expired`, or `Completed` | Context-limit exit, tool failure, explicit blocked-state, harness crash | Agent OS task-state docs if changed | unit/integration test around transition payload |
> | Orchestrator task telemetry | current `TaskStateService` + `HealthService.recordTaskOutcome()` | Define which daemon task records the failed agent execution, and exact details payload | Daemon restart, partial execution, missing issueId | JSDoc near task outcome payload if extended | focused orchestrator service spec |
> | Golden Path / Sandman routing | current Golden Path handoff + Orchestrator cadence | Decide whether failed issue urgency is preserved, demoted, or converted to a blocked/handoff node | No retry storm; no silent suppression | Dream Pipeline / handoff docs if changed | synthetic graph/handoff test |
> | Human/peer handoff | current `signal_state_transition` / A2A notification patterns | Define who gets notified and with which stable identifier | Peer unavailable, wake route missing | workflow docs if changed | MCP/tool-level assertion |
> 
> Routing: add `needs-re-triage`; keep open for shape refresh rather than closing it as not planned.

- 2026-05-28T02:18:40Z @neo-gpt added the `needs-re-triage` label
- 2026-06-03T08:03:29Z @neo-gpt removed the `needs-re-triage` label
- 2026-06-03T08:03:29Z @neo-gpt changed title from **feat: Agent Error Recovery & Re-Queueing for Orchestrator** to **Golden Path issue-task failure envelope and requeue policy**
### @neo-gpt - 2026-06-03T10:23:42Z

**Input from GPT-5.5 (Codex Desktop):**

> ● ## Lane Re-Shaping Capsule — first PR slice, no implementation claim
> 
> I am **not** claiming #9920. This is a bounded re-shaping artifact for the yielded lane so an under-target peer can self-select with less cold-start cost.
> 
> Source-of-authority / collision check:
> 
> - Issue body is already refreshed to the current substrate and correctly scopes V1 to a durable `AgentOrchestrator` outcome envelope plus conservative requeue policy.
> - No open PR currently targets `#9920` (`gh pr list --state open --search '#9920'` returned `[]`).
> - Current implementation surface is `ai/agent/AgentOrchestrator.mjs`: parses Golden Path at lines 33-60, schedules `system:golden-path` directives at lines 99-108, treats queue exhaustion at lines 115-124, and only logs/rethrows top-level failures at lines 127-129.
> - Existing health projection surface is `HealthService.recordTaskOutcome(taskName, status, details)` at `ai/services/memory-core/HealthService.mjs:1399-1415`; it currently accepts `running|completed|failed|skipped` style task states, so #9920's richer issue-outcome statuses should live in the JSONL envelope and be projected into health details rather than expanding health status vocabulary in the first slice.
> - Current test seam exists at `test/playwright/unit/ai/AgentOrchestrator.spec.mjs`, but it only covers `parseGoldenPath()`. The first implementation PR will likely need to add small test seams before it can cover `execute()` without booting a real agent or calling `process.exit(0)`.
> 
> Suggested first PR slice:
> 
> 1. Add injectable seams to `AgentOrchestrator`: an agent factory or class override, a clock, an outcome path, and an exit hook. Keep defaults behavior-compatible.
> 2. Add an append-only JSONL outcome writer owned by `AgentOrchestrator`, defaulting to `.neo-ai-data/agent-orchestrator/golden-path-outcomes.jsonl` as the ticket body specifies.
> 3. Record one outcome per parsed directive with stable fields from the ticket ledger: `runId`, `issueId`, `description`, `startedAt`, `completedAt`, `status`, `reasonCode`, `retryPolicy`, `error`, `handoffMessageId`.
> 4. Wire the low-risk paths first: top-level uncaught error -> `failed` or `crashed`; queue exhaustion -> `completed` or `exhausted`; no immediate retry in-process.
> 5. If a `healthService` is injected, project `recordTaskOutcome('agent-orchestrator', <coarse status>, details)` using the same stable fields in `details`. If no health service exists, JSONL remains source of truth.
> 6. Extend `test/playwright/unit/ai/AgentOrchestrator.spec.mjs` to cover schema, failure-path recording, queue-exhaustion recording, retry-policy default, and health-unavailable fallback.
> 
> Avoided traps for the first PR:
> 
> - Do **not** mutate Golden Path scoring or suppress future issue ranking in V1.
> - Do **not** add `AgentOrchestrator` to `TaskDefinitions.mjs` unless the PR explicitly expands scope and wires `TaskStateService` in the same patch.
> - Do **not** add automatic immediate retries; the V1 policy is durable evidence first, retry policy later.
> - Do **not** make `HealthService` the durable source of truth. Its task-outcome map is projection/observability; the issue envelope needs append-only persistence.
> - Do **not** broaden this into REM/Sandman run-state unification. `RemRunStateStore` is useful precedent, but #9920 is specifically about issue-directed `system:golden-path` work scheduled by `AgentOrchestrator`.
> 
> Suggested focused verification command after implementation:
> 
> ```bash
> npm run test-unit -- test/playwright/unit/ai/AgentOrchestrator.spec.mjs test/playwright/unit/ai/services/memory-core/HealthService.spec.mjs
> ```
> 
> That command only proves the local seams/projection. If the PR also touches daemon-task integration, it needs the relevant orchestrator daemon specs too.
> 
> lane-state: author-yield (#9920 shaped for peer self-selection; no assignee changed; no branch opened)

- 2026-06-06T02:35:13Z @neo-gpt assigned to @neo-gpt
- 2026-06-06T02:48:08Z @neo-gpt cross-referenced by PR #12615
- 2026-06-06T03:08:05Z @neo-gpt referenced in commit `1498e89` - "fix(agent): use execution-timeout reason code (#9920)"
- 2026-06-06T13:24:53Z @tobiu referenced in commit `ac4c724` - "feat(agent): record Golden Path outcomes (#9920) (#12615)

* feat(agent): record Golden Path outcomes (#9920)

* feat(agent): map Golden Path blocked and timeout outcomes (#9920)

* fix(agent): use execution-timeout reason code (#9920)"
- 2026-06-06T13:24:53Z @tobiu closed this issue

