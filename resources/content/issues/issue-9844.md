---
id: 9844
title: 'feat: Implement Safe Commit Pipeline for Autonomous Agent Execution'
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - tobiu
createdAt: '2026-04-10T07:17:09Z'
updatedAt: '2026-04-10T07:17:48Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9844'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[ ] 9845 R&D: Evaluate and Configure Linter for Neo.mjs Custom Code Style'
  - '[ ] 9842 feat: Implement Autonomous Agent Orchestrator with Golden Path Directive Injection'
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

