---
title: Clean Up Old AI Query npm Scripts
labels: enhancement, AI, refactoring
---

GH ticket id: #XXXX

**Epic:** Architect AI Tooling as a Model Context Protocol (MCP)
**Phase:** 3
**Assignee:**
**Status:** To Do

## Description

As part of the transition to the new MCP server architecture, the old `npm` scripts used for direct command-line querying must be removed. The underlying logic in the script files will be refactored and reused by the new servers, but the `npm` scripts themselves will no longer be the agent's entry point.

This cleanup will prevent confusion and ensure that all AI interactions proceed through the new, robust MCP servers.

## Acceptance Criteria

1.  The `ai:query` script is removed from the `scripts` section of `package.json`.
2.  The `ai:query-memory` script is removed from the `scripts` section of `package.json`.
3.  The `AGENTS.md` file is checked to ensure no references to the old scripts remain.

---

## Agent Instructions

To work on this ticket, please start your session with the following prompt:

> Please follow the instructions in @AGENTS.md.
> 
> Once you are initialized, I want to work on a sub-task for the "Architect AI Tooling as a Model Context Protocol (MCP) Servers" epic.
> 
> My task is to implement: **Clean Up Old AI Query npm Scripts**
> 
> You will need to read the epic context from @.github/ISSUE/epic-architect-ai-tooling-as-mcp.md and the specific ticket details from @.github/ISSUE/ticket-cleanup-old-ai-query-npm-scripts.md before we begin.