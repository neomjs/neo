---
id: 7915
title: 'Task: Define Agent Task Protocol (Labels, Templates, Rules)'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-29T15:09:38Z'
updatedAt: '2025-11-29T15:32:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7915'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-29T15:32:12Z'
---
# Task: Define Agent Task Protocol (Labels, Templates, Rules)

# Task: Define Agent Task Protocol (Labels, Templates, Rules)

## Context
As part of the "Agent Orchestration" Epic (#7914), we are moving to a hierarchical swarm model where agents coordinate asynchronously using GitHub Issues. To prevent chaos and "garbage in, garbage out," we need a strict contract (Protocol) that defines how agents communicate.

## Goal
Create a comprehensive specification file `ai/agents/PROTOCOL.md` that serves as the "Law" for all autonomous agents in the Neo.mjs ecosystem.

## Requirements

### 1. Label Schema
Define a strict state machine using GitHub labels.
*   `agent-task:pending`: The task is queued and waiting for a worker agent.
*   `agent-task:in-progress`: A worker agent has claimed the task.
*   `agent-task:blocked`: The agent is stuck (derailed) and needs human intervention.
*   `agent-task:completed`: The task is done (PR created or answer provided).
*   `agent-role:pm`: Ticket assigned to a PM agent.
*   `agent-role:dev`: Ticket assigned to a Dev agent.

### 2. Issue Templates (YAML Contracts)
Define the exact YAML structure that agents must use in the Issue Body.
*   **Epic -> Ticket Handoff:** How a PM Agent describes a task for a Dev Agent.
    ```yaml
    role: dev
    goal: "Implement feature X"
    context:
      files: ["src/foo.mjs"]
      requirements: ["Must pass test Y"]
    ```
*   **Ticket -> PR Handoff:** How a Dev Agent reports success.

### 3. Lifecycle Rules
*   **Claiming:** How an agent "locks" a ticket (e.g., assigning itself).
*   **Derailment:** The exact conditions under which an agent must self-report as `blocked` (e.g., "3 failed attempts at fixing a test").
*   **Completion:** The definition of done (e.g., "PR linked, tests passed").

## Output
*   A new file: `ai/agents/PROTOCOL.md` containing the full specification.


## Timeline

- 2025-11-29T15:09:40Z @tobiu added the `documentation` label
- 2025-11-29T15:09:40Z @tobiu added the `ai` label
- 2025-11-29T15:30:51Z @tobiu assigned to @tobiu
- 2025-11-29T15:31:23Z @tobiu referenced in commit `420d11c` - "Task: Define Agent Task Protocol (Labels, Templates, Rules) #7915"
- 2025-11-29T15:32:12Z @tobiu closed this issue
- 2025-11-29T16:24:29Z @tobiu cross-referenced by #7914

