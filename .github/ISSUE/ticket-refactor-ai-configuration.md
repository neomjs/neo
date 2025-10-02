# Ticket: Refactor and Centralize AI Configuration

GH ticket id: #7324

**Epic:** AI Knowledge Evolution
**Phase:** 1
**Assignee:** tobiu
**Status:** Done

## Description

During the setup of the agent's memory database, a new configuration object (`memoryDBConfig`) was introduced. To avoid scattering configuration details across multiple scripts and creating technical debt, this ticket is to create a single, centralized configuration file for all AI-related scripts (knowledge base, memory, etc.).

## Acceptance Criteria

1.  A new central configuration file is created at `buildScripts/ai/aiConfig.mjs`.
2.  The `memoryDBConfig` from `buildScripts/ai/setupMemoryDB.mjs` is moved into the new config file.
3.  Configuration variables from other AI scripts (e.g., `embedKnowledgeBase.mjs`, `queryKnowledgeBase.mjs`) are identified and moved to the new config file.
4.  All affected AI scripts are updated to import their settings from `buildScripts/ai/aiConfig.mjs`.
5.  The inline `TODO` comment in `setupMemoryDB.mjs` is removed.
