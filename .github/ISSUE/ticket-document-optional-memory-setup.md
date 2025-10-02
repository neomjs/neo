# Ticket: Document Optional Memory Core Setup

GH ticket id: #7326

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

To make the AI agent's memory core an optional, opt-in feature, this ticket covers the creation of documentation for developers on how to set up and enable it.

This documentation will be added to `AI_QUICK_START.md` and will serve as the primary guide for developers who wish to utilize the agent's memory capabilities.

## Acceptance Criteria

1.  A new section is added to `AI_QUICK_START.md` titled "Optional: Enable Agent Memory Core."
2.  This section provides clear, step-by-step instructions for:
    a.  Starting the dedicated ChromaDB memory server (`npm run ai:server-memory`).
    b.  Initializing the memory collection (`npm run ai:setup-memory-db`).
3.  The documentation emphasizes that this is an optional feature and explains its benefits.
