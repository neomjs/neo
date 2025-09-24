# Ticket: Implement "Ticket-First" Mandate in Agent Workflow

GH ticket id: #7240

**Assignee:** Gemini
**Status:** Done

## Description

To improve traceability and ensure all repository modifications are documented from the outset, a "Ticket-First" mandate was integrated into the AI agent's core development workflow.

This change also required careful consideration of edge cases to prevent the agent from creating unnecessary tickets for non-modification tasks.

## Changes

-   The "Development Workflow" section in `AGENTS.md` was restructured.
-   A new initial step, "Understand the Task & Identify Intent," was added. This instructs the agent to differentiate between informational/conceptual queries and tasks that require repository modifications.
-   A second step, "Ensure a Ticket Exists (Ticket-First Mandate)," was added. This **requires** the agent to create a ticket for any modification task if one does not already exist, before any other action is taken.
-   The subsequent steps (Query, Implement, Verify) were re-numbered and integrated into this new flow.

## Impact

This establishes a more robust and professional development process where every change to the codebase is tracked in a ticket from its inception. It provides clarity for both the AI and human developers, ensuring no work happens "off the books".
