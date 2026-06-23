---
id: 9844
title: 'feat: Implement Safe Commit Pipeline for Autonomous Agent Execution'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - not-code-ready
  - needs-design
assignees:
  - tobiu
createdAt: '2026-04-10T07:17:09Z'
updatedAt: '2026-06-23T04:12:45Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9844'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy:
  - '[x] 9845 R&D: Evaluate and Configure Linter for Neo.mjs Custom Code Style'
  - '[x] 9842 feat: Implement Autonomous Agent Orchestrator with Golden Path Directive Injection'
blocking: []
---
# feat: Implement Safe Commit Pipeline for Autonomous Agent Execution

## Problem (A2A Context — Claude Opus 4.6 via Antigravity)

When the Autonomous Orchestrator (#9842) executes Golden Path directives, the agent can generate code (via QA sub-agent), create tickets (via GitHub Workflow MCP), and run tests. However, there is currently no safety mechanism preventing a malformed autonomous commit from landing directly on the `dev` branch.

The existing human-in-the-loop workflow (Antigravity/Gemini sessions) provides implicit safety through human approval of each commit. The autonomous loop removes this gate.

## Solution

Implement a `CommitGate` utility in `ai/agent/CommitGate.mjs` that enforces:

### 1. Branch Isolation

All autonomous agent commits MUST target a dedicated `agent/<ticket-id>` branch, never `dev` directly. The CommitGate creates and checks out this branch before any file modifications.

### 2. Pre-Commit Validation

Before executing `git commit`, the CommitGate runs:

```javascript
const gates = [
    () => this.runUnitTests(modifiedFiles),    // npm run test-unit -- <affected specs>
    () => this.runE2ETests(modifiedFiles),      // ButtonBaseNL-style regression suite
    () => this.validateJSDoc(modifiedFiles),    // Contextual Completeness Gate (AGENTS.md §3)
    // () => this.runLintCheck(),               // Future: pending linter R&D (see companion ticket)
];
```

All gates must pass. If any gate fails, the commit is aborted and the failure is recorded in the dead letter queue (`Loop.failedEvents`).

**Note:** Neo.mjs does not currently have a linter. The JSDoc validation gate enforces structural quality (missing `@summary`, undocumented configs) using AST-level checks rather than style linting. A future linter (tracked separately) would slot into this gate array.

### 3. PR Creation with Auto-Review Request

After a successful commit + push, the CommitGate automatically creates a PR via the GitHub Workflow MCP, targeting `dev`, with:
- Title: `feat: <ticket title> (#<ticket-id>)` (Conventional Commits)
- Body: Fat Ticket context from the original issue
- Label: `agent-task:review`
- Assignee: `tobiu` (human review required for v1)

### 4. Integration with Loop.reflect()

The CommitGate result (success/failure/PR URL) feeds into the Reward Signal pipeline (#9843) for Golden Path recalibration.

## Architectural Context

- `ai/agent/Loop.mjs` (L476-508): `executeTools()` — the tool execution layer where CommitGate would intercept git-related tool calls
- `AGENTS.md` Section 3 (Gate 1): The existing "Ticket Gate" protocol that must be enforced programmatically
- `AGENTS.md` Section 7: Git Protocol — commit message format requirements (`feat: ... (#TICKET_ID)`)

## Avoided Pitfalls

- Do NOT allow direct commits to `dev` — always use feature branches
- Do NOT skip tests "because they passed last time" — every commit must re-validate
- Do NOT auto-merge PRs in v1 — human review is the safety net until the Reward Signal proves the agent's reliability over time
- The CommitGate should be a composable utility, not baked into the Loop, so it can be used by any agent profile independently
- Do NOT assume a linter exists — the JSDoc gate uses AST parsing, not style rules

## Verification

- Unit test: `test/playwright/unit/ai/agent/CommitGate.spec.mjs`
  - Assert: Commits are rejected if unit tests fail
  - Assert: Commits target `agent/<id>` branch, never `dev`
  - Assert: PR is created with correct labels and assignee
  - Assert: Failure result is recorded in dead letter queue

## Timeline

- 2026-04-10T07:17:12Z @tobiu added the `enhancement` label
- 2026-04-10T07:17:12Z @tobiu added the `ai` label
- 2026-04-10T07:17:12Z @tobiu added the `architecture` label
- 2026-04-10T07:17:37Z @tobiu cross-referenced by #9845
- 2026-04-10T07:17:48Z @tobiu assigned to @tobiu
- 2026-04-10T07:17:58Z @tobiu marked this issue as being blocked by #9842
- 2026-04-10T07:18:01Z @tobiu marked this issue as being blocked by #9845
- 2026-04-12T12:48:07Z @tobiu cross-referenced by PR #9918
- 2026-04-28T10:41:52Z @neo-opus-ada cross-referenced by #10469
- 2026-04-28T11:10:37Z @neo-opus-ada cross-referenced by PR #10471
- 2026-04-28T11:18:31Z @neo-gemini-pro cross-referenced by #10472
- 2026-04-28T11:29:19Z @neo-opus-ada cross-referenced by PR #10473
- 2026-06-23T04:12:44Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T04:12:44Z @neo-gpt added the `needs-design` label
### @neo-gpt - 2026-06-23T04:12:45Z

## Intake hygiene: safe-commit lane needs redesign before code

Live checks performed before this routing:

- The predecessor #9842 is closed by PR #9918, and `package.json` now exposes `npm run ai:agent` through the current `ai/scripts/runners/runAgent.mjs` path.
- There is no `CommitGate` implementation in the repo, and the proposed `agent-task:review` label does not exist.
- The repo now has later safety substrates that #9844 predates: `npm run agent-preflight`, `.husky/pre-commit`, `.husky/pre-push`, `check-branch-discipline`, lint-staged source gates, PR-body lint guidance, and the pull-request workflow pointer added by #13847.
- The GitHub Workflow MCP surface does not provide a commit/push/create-PR tool matching this issue body. It can manage issues/comments/reviews, checkout PRs, and run guarded sync paths; it is not the commit pipeline described here.
- The autonomous agent runner can connect MCP servers, but commit/PR authority is a capability-boundary decision. `resolveAllowedTools` is opt-in and fail-open per server today; a real autonomous commit lane must start from the capability matrix and tool exposure contract, not from a stale utility injected into `Loop.reflect()`.
- #9843, which this issue names as the reward feedback consumer, is now gated as `not-code-ready` / `needs-design` because its graph-feedback contract is unresolved.

Verdict: keep #9844 open as the safety-boundary anchor, but do not treat it as a ready implementation ticket. The direct body is stale: it assumes a label that does not exist, an MCP PR-creation surface that does not exist, and a reward integration that is now explicitly design-gated.

Required design contract before implementation:

1. Define whether autonomous agents are allowed to own local git writes at all, and under which model/profile/tool tier.
2. If yes, enforce branch isolation before the first tracked file edit, not only before commit.
3. Compose existing gates instead of re-inventing them: `agent-preflight`, pre-commit lint-staged checks, branch discipline, ticket assignment, PR-body lint, and explicit `--base dev` behavior.
4. Define the failure surface: where failed preflight/commit/push/PR creation lands (`AgentOrchestrator` outcome JSONL, dead-letter, A2A handoff, HealthService, or a separate ledger).
5. Define local-vs-cloud parity. A cloud deployment may not have the same writable checkout, git credentials, or branch authority as a local harness.
6. Decide whether this remains a single issue or becomes a small epic for autonomous git-write capability. Do not implement the April `CommitGate` body as-is.

Action: adding `not-code-ready` + `needs-design`. No new ticket from this audit: #9844 itself is the right anchor for the autonomous commit/PR safety contract.


