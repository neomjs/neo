---
title: Correct Agent Initialization Workflow
labels: bug, AI, documentation
---

GH ticket id: #7362

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

The agent's session initialization workflow had a logical flaw. It was saving the new session's first memory *before* summarizing previous sessions, causing the new session to be summarized prematurely. This ticket documents the correction of that workflow.

## Acceptance Criteria

1.  The agent's internal workflow is updated to first summarize all un-summarized sessions.
2.  Only after summarization is complete does the agent save the initial memory for the new session.
3.  The agent has persisted this corrected workflow to its long-term memory to ensure it is followed in all future sessions.
