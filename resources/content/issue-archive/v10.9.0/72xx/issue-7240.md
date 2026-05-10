---
id: 7240
title: Implement "Ticket-First" Mandate in Agent Workflow
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-23T13:57:24Z'
updatedAt: '2025-09-23T13:58:36Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7240'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-09-23T13:58:36Z'
---
# Implement "Ticket-First" Mandate in Agent Workflow

To improve traceability and ensure all repository modifications are documented from the outset, a "Ticket-First" mandate was integrated into the AI agent's core development workflow.

This change also required careful consideration of edge cases to prevent the agent from creating unnecessary tickets for non-modification tasks.

## Changes

-   The "Development Workflow" section in `AGENTS.md` was restructured.
-   A new initial step, "Understand the Task & Identify Intent," was added. This instructs the agent to differentiate between informational/conceptual queries and tasks that require repository modifications.
-   A second step, "Ensure a Ticket Exists (Ticket-First Mandate)," was added. This **requires** the agent to create a ticket for any modification task if one does not already exist, before any other action is taken.
-   The subsequent steps (Query, Implement, Verify) were re-numbered and integrated into this new flow.

## Impact

This establishes a more robust and professional development process where every change to the codebase is tracked in a ticket from its inception. It provides clarity for both the AI and human developers, ensuring no work happens "off the books".

## Timeline

- 2025-09-23T13:57:24Z @tobiu assigned to @tobiu
- 2025-09-23T13:57:25Z @tobiu added the `enhancement` label
- 2025-09-23T13:58:25Z @tobiu referenced in commit `6362f5f` - "Implement "Ticket-First" Mandate in Agent Workflow #7240"
- 2025-09-23T13:58:37Z @tobiu closed this issue

