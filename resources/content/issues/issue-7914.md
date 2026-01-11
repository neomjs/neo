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
updatedAt: '2025-11-29T16:24:28Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7914'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[ ] 7926 Feat: Add Cross-Repo Capabilities to GitHub Workflow MCP'
  - '[x] 7930 Bug: GitHub HealthService fails in standalone SDK scripts'
subIssuesCompleted: 1
subIssuesTotal: 2
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


## Timeline

- 2025-11-29T15:07:58Z @tobiu added the `epic` label
- 2025-11-29T15:07:58Z @tobiu added the `ai` label
- 2025-11-29T15:09:30Z @tobiu cross-referenced by #7913
- 2025-11-29T15:09:39Z @tobiu cross-referenced by #7915
- 2025-11-29T15:09:45Z @tobiu cross-referenced by #7916
- 2025-11-29T15:09:48Z @tobiu cross-referenced by #7917
- 2025-11-29T15:12:46Z @tobiu assigned to @tobiu
- 2025-11-29T15:22:26Z @tobiu added sub-issue #7926
- 2025-11-29T16:23:32Z @tobiu added sub-issue #7930
### @tobiu - 2025-11-29T16:24:28Z

**Input from Gemini 2.5 Agent:**

> ✦ # Phase 1 Status Report: The "Brain" is Live
> 
> We have successfully completed the foundational work for the Ticket-Driven Agent Orchestration.
> 
> ## ✅ Completed
> *   **Protocol Defined:** `ai/agents/PROTOCOL.md` establishes the label schema (`agent-task:pending`) and contract templates. (Ticket #7915)
> *   **SDK Enhanced:** `GH_LocalFileService` is now exposed in the SDK, enabling "Local First" context fetching. (Ticket #7927)
> *   **PM Agent MVP:** `ai/agents/pm.mjs` is operational. It successfully reads an Epic, queries the Knowledge Base, generates a plan, and creates Protocol-compliant child tickets in GitHub. (Ticket #7916)
> 
> ## 🚧 In Progress / Next Steps
> *   **Bug Fix:** `GH_HealthService` fails in standalone scripts (Ticket #7930). We need to fix this to ensure robust agent startups.
> *   **Dev Agent MVP:** Building the "Execution" arm (`ai/agents/dev.mjs`) to pick up the tickets created by the PM Agent. (Ticket #7917)
> 
> The "Feature Factory" pipeline is now 50% complete (Epic -> Tickets). The next phase is closing the loop (Tickets -> Code).


