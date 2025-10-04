---
title: Refactor `summarizeSession.mjs` to automatically summarize all un-summarized sessions
labels: enhancement, refactoring, AI
---

GH ticket id: #7358

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** To Do

## Description

The current session summarization workflow is clunky, requiring one script to find the last session and another to summarize it. This ticket is to refactor `summarizeSession.mjs` to be more intelligent and autonomous.

## Acceptance Criteria

1.  `buildScripts/ai/summarizeSession.mjs` is updated to make the `--session-id` parameter optional.
2.  If no `session-id` is provided, the script automatically finds and summarizes all sessions that have not yet been summarized.
3.  The `buildScripts/ai/getLastSession.mjs` script is deleted.
4.  The `ai:get-last-session` script is removed from `package.json`.
5.  `AGENTS.md` is updated to reflect the new, simplified workflow for session summarization.
