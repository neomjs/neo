---
title: Ensure Cross-Platform UUID Generation for Agent Memory
labels: enhancement, AI, bug
---

GH ticket id: #7398

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

This ticket addresses a cross-platform compatibility issue in the agent's session initialization protocol. The command `node -e "console.log(crypto.randomUUID())"` specified in `AGENTS.md` for generating a session ID is not reliable on Windows Command Prompt (`cmd.exe`) due to its specific handling of double quotes.

This could prevent agents operating on Windows from successfully initializing their memory core, creating a frustrating and inconsistent experience for contributors on that platform.

This sub-task is to update the command to a more robust, cross-platform syntax that works reliably across different shell environments.

## Acceptance Criteria

1.  `AGENTS.md` is updated with a cross-platform compatible command for generating a UUID that is tested to work on Unix-like systems and Windows Command Prompt.
