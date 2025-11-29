---
id: 7914
title: 'Epic: Foundation for Ticket-Driven Agent Orchestration'
state: OPEN
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T15:07:56Z'
updatedAt: '2025-11-29T15:12:46Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7914'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Epic: Foundation for Ticket-Driven Agent Orchestration

# Epic: Foundation for Ticket-Driven Agent Orchestration

This epic captures the strategic initiative to transform Neo.mjs into the "Corporate Headquarters for AI Agents." We are moving from single-agent tool use to a hierarchical swarm of specialized agents (PMs, Developers) that coordinate asynchronously using GitHub Issues as their message bus.

## Strategic Goals
1.  **Establish the "Ticket-Driven Protocol":** Define a strict contract for how agents communicate via GitHub Issues (labels, templates, state transitions).
2.  **Enable Cross-Repo Coordination:** Empower agents in one repository to queue tasks for agents in another.
3.  **Prove the "Feature Factory":** Demonstrate a fully autonomous workflow where an Epic is broken down into Tickets (PM Agent) and those Tickets are resolved into PRs (Dev Agent).

## Key Deliverables

### 1. The Protocol (Contract)
-   [ ] **Define Agent Task Protocol:** Create `ai/agents/PROTOCOL.md` specifying label schemas (`agent-task:pending`), issue templates, and handoff rules.

### 2. The "Headless" Workforce (MVP Agents)
-   [ ] **PM Agent MVP:** A standalone Node.js script (`ai/agents/pm.mjs`) that reads an Epic and generates sub-issues based on the protocol.
-   [ ] **Dev Agent MVP:** A standalone Node.js script (`ai/agents/dev.mjs`) that picks up a `pending` issue, attempts a code fix, and submits a PR.

### 3. Infrastructure
-   [ ] **GitHub Workflow Enhancements:** Update the MCP server to support cross-repo issue creation and label management required by the protocol.

## Success Metric
The "Feature Factory" Experiment: A single command (`npm run agent:feature -- --epic=123`) successfully triggers the chain:
`Epic -> PM Agent -> Tickets -> Dev Agent -> PR`
without human intervention.


## Activity Log

- 2025-11-29 @tobiu added the `epic` label
- 2025-11-29 @tobiu added the `ai` label
- 2025-11-29 @tobiu cross-referenced by #7913
- 2025-11-29 @tobiu cross-referenced by #7915
- 2025-11-29 @tobiu cross-referenced by #7916
- 2025-11-29 @tobiu cross-referenced by #7917
- 2025-11-29 @tobiu assigned to @tobiu

