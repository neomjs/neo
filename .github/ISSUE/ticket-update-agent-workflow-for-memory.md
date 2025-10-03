# Ticket: Update Agent Workflow for Memory

GH ticket id: #7320

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket involves updating the agent's core instructions (`AGENTS.md`) to integrate an **optional and dynamic** memory core into its standard workflow. Instead of a mandatory setup, the agent will proactively manage the memory core's activation based on its running status and user preference.

## Acceptance Criteria

1.  The `AGENTS.md` file is updated with a new section describing the "Optional Memory Core Activation & Usage" protocol.
2.  This new protocol instructs the agent to:
    a.  **Check Memory Server Status:** At the beginning of each session (or when memory is first needed), attempt to connect to the memory ChromaDB server (`http://localhost:8001`).
    b.  **Conditional Prompt:**
        *   If the server is *not* running, ask the user: "The memory core server is not running. Would you like to enable it? (yes/no)"
        *   If the user responds "yes":
            *   Instruct the user: "Please start the memory server in a separate terminal: `npm run ai:server-memory`"
            *   Once the user confirms the server is running, execute: `npm run ai:setup-memory-db` to ensure the collection is initialized.
            *   The memory core is now active.
        *   If the user responds "no" (or if the server is already running), proceed with the session, either with or without memory enabled based on their choice.
    c.  **Session ID Management:** Generate and maintain a `sessionId` for the current interaction. This `sessionId` will be passed to `ai:add-memory` for every memory entry.
3.  **Memory Persistence (Transactional):** If the memory core is enabled, a **"save-then-respond"** model is mandatory. **Before** providing the response to the user, the agent **MUST** first persist a record of the turn using `npm run ai:add-memory`. This includes the user's prompt, the agent's internal thought process, and the full response.
4.  **Memory Recall (Proactive):** When a user's prompt suggests that historical context might be relevant, the agent will proactively query its memory using `npm run ai:query-memory`. The results will inform planning and response generation.
5.  **Two-Stage Query Protocol:** The `AGENTS.md` will describe the two-stage query process: first knowledge base, then memory, and how to synthesize information from both.
