---
id: 9296
title: Create Docker Sandbox for Autonomous Agents
state: OPEN
labels:
  - enhancement
  - ai
  - build
assignees: []
createdAt: '2026-02-24T19:32:10Z'
updatedAt: '2026-02-24T19:32:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9296'
author: tobiu
commentsCount: 0
parentIssue: 9295
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Docker Sandbox for Autonomous Agents

### Problem
Autonomous, looping agents need an isolated environment where they can execute downloaded code, crash browsers, or make mistakes without affecting the host developer machine.

### Solution
Create a `Dockerfile.agent` (likely within `ai/demo-agents/`) that bundles Node.js, Chromium, and the Neo MCP servers. This provides a safe, reproducible Linux sandbox for the Neo Orchestrator to run headless browser sessions via the `chrome-devtools` MCP server.

## Timeline

- 2026-02-24T19:32:11Z @tobiu added the `enhancement` label
- 2026-02-24T19:32:11Z @tobiu added the `ai` label
- 2026-02-24T19:32:11Z @tobiu added the `build` label
- 2026-02-24T19:32:21Z @tobiu added parent issue #9295

