---
id: 7324
title: Refactor and Centralize AI Configuration
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-02T08:41:32Z'
updatedAt: '2025-10-02T09:00:26Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7324'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-02T09:00:26Z'
---
# Refactor and Centralize AI Configuration

During the setup of the agent's memory database, a new configuration object (`memoryDBConfig`) was introduced. To avoid scattering configuration details across multiple scripts and creating technical debt, this ticket is to create a single, centralized configuration file for all AI-related scripts (knowledge base, memory, etc.).

## Acceptance Criteria

1.  A new central configuration file is created at `buildScripts/ai/aiConfig.mjs`.
2.  The `memoryDBConfig` from `buildScripts/ai/setupMemoryDB.mjs` is moved into the new config file.
3.  Configuration variables from other AI scripts (e.g., `embedKnowledgeBase.mjs`, `queryKnowledgeBase.mjs`) are identified and moved to the new config file.
4.  All affected AI scripts are updated to import their settings from `buildScripts/ai/aiConfig.mjs`.
5.  The inline `TODO` comment in `setupMemoryDB.mjs` is removed.

## Timeline

- 2025-10-02T08:41:32Z @tobiu assigned to @tobiu
- 2025-10-02T08:41:33Z @tobiu added the `enhancement` label
- 2025-10-02T08:41:33Z @tobiu added parent issue #7316
- 2025-10-02T09:00:06Z @tobiu referenced in commit `f51badd` - "Refactor and Centralize AI Configuration #7324"
- 2025-10-02T09:00:26Z @tobiu closed this issue

