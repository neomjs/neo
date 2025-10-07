---
title: Update AGENTS.md for New MCP Server Architecture
labels: enhancement, AI, documentation
---

GH ticket id: #XXXX

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 3
**Assignee:**
**Status:** To Do

## Description

With the new Knowledge Base and Memory Core MCP servers implemented, the primary `AGENTS.md` guidelines must be updated to instruct agents on how to use them. This is the final step to fully transition away from the old shell-based command execution.

This task involves removing the old `npm run ai:query` and `npm run ai:query-memory` instructions and replacing them with instructions to use the new, native MCP tools (e.g., `queryKnowledgeBase`, `queryMemory`).

## Acceptance Criteria

1.  All references to `npm run ai:query` and `npm run ai:query-memory` are removed from `AGENTS.md`.
2.  The "Query Command" and "Two-Stage Query Protocol" sections are updated to reflect the use of native tools.
3.  The instructions are clear, concise, and easy for an agent to follow.
4.  The session initialization instructions are updated to include starting the new MCP servers if they are not already running.
