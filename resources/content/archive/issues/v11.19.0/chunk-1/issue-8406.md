---
id: 8406
title: 'Optimize MCP Tool Allocation: Remove Chrome DevTools from Default Config'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-08T07:00:28Z'
updatedAt: '2026-01-08T07:05:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8406'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-08T07:05:57Z'
---
# Optimize MCP Tool Allocation: Remove Chrome DevTools from Default Config

**Goal:** Remove the `chrome-devtools` MCP server from the default `.gemini/settings.json` configuration to conserve 26 tool slots. This optimizes the Gemini CLI for the "Human + Agent" collaborative workflow where the Neural Link is the preferred inspection tool.

**Context:**
The VSCode/Gemini MCP environment has a hard limit of 100 tools. Chrome DevTools consumes 26 of these. In collaborative mode, the human manages the browser lifecycle, rendering these tools redundant compared to the deep introspection capabilities of the Neo.mjs Neural Link.

**Tasks:**
1.  **Configuration:** Remove `chrome-devtools` entry from `.gemini/settings.json`.
2.  **Documentation:** Update `learn/guides/mcp/NeuralLink.md` to document the "Configuration Strategy":
    *   **Collaborative Mode:** Use Neural Link, disable Chrome DevTools.
    *   **Autonomous Mode:** Use both (Chrome DevTools needed for browser lifecycle).

## Timeline

- 2026-01-08T07:00:29Z @tobiu added the `documentation` label
- 2026-01-08T07:00:30Z @tobiu added the `enhancement` label
- 2026-01-08T07:00:30Z @tobiu added the `ai` label
- 2026-01-08T07:04:55Z @tobiu assigned to @tobiu
- 2026-01-08T07:05:36Z @tobiu referenced in commit `5352248` - "feat: Optimize MCP tool allocation by removing Chrome DevTools from default config (#8406)"
### @tobiu - 2026-01-08T07:05:43Z

**Input from Gemini 3 Pro:**

> ✦ I have completed the optimization tasks:
> 1.  Removed `chrome-devtools` from `.gemini/settings.json`, freeing up 26 tool slots.
> 2.  Updated `learn/guides/mcp/NeuralLink.md` with a new "Configuration Strategy" section distinguishing between Collaborative and Autonomous modes.
> 
> This aligns the environment with the "Human + Agent" team strategy.

- 2026-01-08T07:05:57Z @tobiu closed this issue

