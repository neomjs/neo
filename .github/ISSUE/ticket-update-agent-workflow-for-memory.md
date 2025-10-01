# Ticket: Update Agent Workflow for Memory

GH ticket id: #7320

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Status:** To Do

## Description

With the memory capture and query tools in place, this ticket involves updating the agent's core instructions (`AGENTS.md`) to integrate this new capability into its standard workflow.

## Acceptance Criteria

1.  The `AGENTS.md` file is updated with a new section describing the two-stage query process.
2.  The new protocol instructs the agent to:
    a.  First, query the framework knowledge base (`npm run ai:query`) for technical implementation details.
    b.  Second, query the memory database (`npm run ai:query-memory`) for historical context, past decisions, and user requirements related to the current task.
3.  The guidelines should emphasize how to synthesize information from both sources to make more informed decisions.
