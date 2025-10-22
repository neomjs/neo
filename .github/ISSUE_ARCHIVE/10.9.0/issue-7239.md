---
id: 7239
title: Define and Document the Hybrid Archival Ticket Strategy
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-23T13:53:42Z'
updatedAt: '2025-09-23T13:55:20Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7239'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-23T13:55:20Z'
---
# Define and Document the Hybrid Archival Ticket Strategy

**Reported by:** @tobiu on 2025-09-23

To address challenges with repository bloat, knowledge base persistence, and GitHub issue integration, a new "Hybrid Archival Process" for tickets was defined and documented.

This new strategy ensures that the history of work remains portable and accessible to AI agents while keeping the working repository clean.

## Changes

1.  **`TICKET_STRATEGY.md` Created:**
    -   A new file, `.github/TICKET_STRATEGY.md`, was created to serve as the single source of truth for the ticketing process.
    -   It details the three phases of a ticket's lifecycle: Creation, Association (manual linking to a GitHub issue), and Archival (concatenating tickets into a single file post-release).

2.  **`AGENTS.md` Updated:**
    -   The agent's "Session Initialization" process was updated with a new mandatory step: the agent **MUST** read `.github/TICKET_STRATEGY.md` at the start of every session.

## Impact

This establishes a clear, scalable, and robust process for managing work items. It solves the problem of losing historical context for the AI, prevents repository bloat, and creates a clear path for linking version-controlled tickets with the GitHub issue tracker.

