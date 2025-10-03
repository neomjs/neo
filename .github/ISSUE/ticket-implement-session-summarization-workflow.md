---
title: Implement Automated Session Summarization Workflow
labels: documentation, enhancement, AI
---

GH ticket id: #7336

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

To improve context and continuity between sessions, the agent's startup protocol needs to be enhanced. When a new session starts with the memory core enabled, the agent should automatically summarize the work of the *previous* session.

This creates a virtuous cycle where the end of one session's work becomes the starting context for the next.

## Acceptance Criteria

1.  The `.github/AGENTS.md` file is updated to include a new step in the "Session Initialization" sequence.
2.  This new step instructs the agent to, if the memory core is active, find the `sessionId` of the most recent previous session.
3.  If a previous session ID is found, the agent must execute `npm run ai:summarize-session` on that ID.
4.  This step should be positioned after the memory core check in the initialization process.
