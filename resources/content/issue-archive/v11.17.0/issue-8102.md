---
id: 8102
title: Mandate Sub-Agent Context Injection in AGENTS_STARTUP.md
state: CLOSED
labels:
  - documentation
  - contributor-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-12-12T23:11:02Z'
updatedAt: '2025-12-12T23:15:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8102'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-12-12T23:15:34Z'
---
# Mandate Sub-Agent Context Injection in AGENTS_STARTUP.md

### Problem
Standard sub-agents (like `codebase_investigator`) lack the specific context of the Neo.mjs framework, particularly the config system logic defined in `src/core/Base.mjs`. This leads to incorrect analysis (hallucinations) when they assume standard JavaScript property behavior instead of Neo.mjs reactive configs.

### Solution
Update `AGENTS_STARTUP.md` to include a directive for agents. When invoking a sub-agent, the parent agent MUST inject a "Context Preamble" or explicitly instruct the sub-agent to read `src/core/Base.mjs` and `src/Neo.mjs` to understand the framework's "physics" before analyzing code.

## Timeline

- 2025-12-12T23:11:03Z @tobiu added the `documentation` label
- 2025-12-12T23:11:03Z @tobiu added the `contributor-experience` label
- 2025-12-12T23:11:03Z @tobiu added the `ai` label
- 2025-12-12T23:14:07Z @tobiu assigned to @tobiu
- 2025-12-12T23:15:27Z @tobiu referenced in commit `3532229` - "Mandate Sub-Agent Context Injection in AGENTS_STARTUP.md #8102"
- 2025-12-12T23:15:34Z @tobiu closed this issue

