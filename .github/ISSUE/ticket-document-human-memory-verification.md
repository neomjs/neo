---
title: Document Human Verification of Agent Memory
labels: documentation, enhancement, AI
---

GH ticket id: (pending)

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

To ensure the integrity of the agent's memory core, this ticket covers updating the `.github/WORKING_WITH_AGENTS.md` guide to instruct human developers on their role in the memory-saving process.

While the agent is mandated to follow a "save-then-respond" protocol, a sufficiently derailed agent might fail to do so. This update introduces the concept of a "human-in-the-loop" safeguard for the memory protocol itself.

## Acceptance Criteria

1.  A new section, titled **"The Memory Core: A Shared Responsibility"**, is added to `.github/WORKING_WITH_AGENTS.md`.
2.  This section explains the agent's "save-then-respond" duty.
3.  This section explicitly defines the human developer's duty to verify that the `ai:add-memory` tool call is successfully made after every agent turn when the memory core is active.
4.  The section provides a clear recovery prompt for the user to issue in case the agent fails to save its memory.
