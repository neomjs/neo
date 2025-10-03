---
title: Clarify Agent Memory Protocol and Tooling
labels: documentation, enhancement, AI
---

GH ticket id: #7335

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** To Do

## Description

During the first live test of the memory core, the agent failed to follow the "save-then-respond" protocol due to two issues:
1.  A misinterpretation of the procedural order in `AGENTS.md`, where the memory check was not performed during initialization.
2.  A lack of clarity in the `addMemory.mjs` script's command-line interface, leading to several failed attempts to save the session history.

This ticket covers the documentation and process improvements needed to prevent these failures in the future.

## Acceptance Criteria

1.  The `.github/AGENTS.md` file is updated to move the memory server check into the "Session Initialization" section.
2.  The `buildScripts/ai/addMemory.mjs` script is updated with clear documentation for its command-line options, especially `--thought` and `--session-id`.
