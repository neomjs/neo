---
title: Clarify ai:add-memory command in AGENTS.md
labels: documentation, enhancement, AI
---

GH ticket id: #7356

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

The agent made an error when first attempting to save a memory to the core, using the incorrect `--sessionId` flag instead of the correct `--session-id`. This was because the instructions in `AGENTS.md` were not explicit about the exact command-line structure.

This ticket is to update the agent guidelines to prevent this specific error in the future.

## Acceptance Criteria

1.  The `.github/AGENTS.md` file is updated within the "Memory Core Protocol" section to include a clear, templated example of the `npm run ai:add-memory` command, showing the correct `--session-id` flag and argument structure.
