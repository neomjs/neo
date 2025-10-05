---
title: Clarify Agent Memory Server Port in AGENTS.md
labels: documentation, enhancement, AI
---

GH ticket id: #7361

**Epic:** AI Knowledge Evolution
**Phase:** 2
**Assignee:** tobiu
**Status:** Done

## Description

The `AGENTS.md` file currently implies the agent should check for the memory core server on the default port 8000. However, the knowledge base server runs on port 8000, and the memory server runs on port 8001. This ambiguity can lead to incorrect server checks during the agent's initialization process.

## Goal

Update `AGENTS.md` to clearly state that the memory server runs on port 8001 and ensure the health check command targets the correct port. This will improve the reliability of the agent's session initialization.
