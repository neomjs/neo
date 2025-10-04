---
title: Create and Integrate `ai:get-last-session` Script
labels: documentation, enhancement, AI
---

GH ticket id: #7357

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

To make the agent's session initialization process more robust, a new script was needed to reliably find the ID of the most recent session from the memory database. This ticket covers the creation of that script and its integration into the agent's workflow.

## Acceptance Criteria

1.  The `buildScripts/ai/getLastSession.mjs` script is created to find the most recent session ID and its summarization status.
2.  The `package.json` file is updated with a new `ai:get-last-session` npm script.
3.  The `AGENTS.md` file is updated to instruct the agent to use the new `npm run ai:get-last-session` script during its initialization.
