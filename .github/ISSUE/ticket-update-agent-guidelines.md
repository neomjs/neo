# Update AI Agent Guidelines in AGENTS.md

GH ticket id: #7253

**Assignee:** tobiu
**Status:** Done

## Description

This ticket addresses updates made to the `AGENTS.md` file to enhance AI agent guidelines.

## Changes

1.  **Expanded Query Tool Types:** Added `release` and `ticket` as supported content types for the `npm run ai:query` command (line 65 in `AGENTS.md`). This allows for more targeted searches within the knowledge base.
2.  **Clarified External Knowledge Usage:** Added a clarification in lines 11-14 of `AGENTS.md` stating that for general software engineering topics or questions about other technologies, the AI agent is permitted to use its general training knowledge and external search tools. This helps to delineate the scope of reliance on the Neo.mjs internal knowledge base.

## Justification

These updates improve the clarity and functionality of the AI agent's operational guidelines, enabling more efficient and accurate assistance within and outside the Neo.mjs framework context.
