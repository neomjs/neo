# Ticket: Correct agent memory initialization protocol

GH ticket id: #7341

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description
The `AGENTS.md` file incorrectly implied that the session ID should be saved to long-term memory. This ticket corrects the protocol to ensure that the agent immediately begins persisting the session to the memory core using the generated session ID, starting with the very first user prompt.

## Changes
- Updated `AGENTS.md` to add an explicit step: "Persist Initial Context" after generating a new session ID in two separate flows.
