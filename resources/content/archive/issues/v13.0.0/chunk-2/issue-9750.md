---
id: 9750
title: Fix Prio 0 swarm boot sequence & plan file-system MCP server
state: CLOSED
labels:
  - bug
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-07T10:13:40Z'
updatedAt: '2026-04-07T11:07:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9750'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T10:40:46Z'
---
# Fix Prio 0 swarm boot sequence & plan file-system MCP server

1. **Prio 0 Architectural Fix:** Subagents and test harnesses were improperly calling `await instance.initAsync()` instead of subscribing to the `ready()` promise. This has been corrected.
2. **Knowledge Base Enhancement (Anchor & Echo):** Added explicit warnings in `src/core/Base.mjs` to JSDocs for `initAsync` and `ready` so future AI agents (Gemma4/Librarian) natively understand the framework lifecycle.
3. **Core Tooling Extension:** Subagents require the ability to read files to avoid UI component hallucination. We will construct a new standalone MCP server (`ai/mcp/server/file-system/`) for raw tooling, rather than bloating the `knowledge-base` engine.
4. **Cleanup:** Delete obsolete `ai/swarm/qa-test.mjs` PoC in favor of `test/playwright/unit/ai/agent/QA.spec.mjs`.

## Timeline

- 2026-04-07T10:13:44Z @tobiu added the `bug` label
- 2026-04-07T10:13:44Z @tobiu added the `enhancement` label
- 2026-04-07T10:13:44Z @tobiu added the `ai` label
- 2026-04-07T10:16:14Z @tobiu referenced in commit `07c3bd7` - "feat: Fix Prio 0 swarm boot sequence & update JSDocs (#9750)"
- 2026-04-07T10:40:09Z @tobiu referenced in commit `5db53c3` - "feat: Implement ai/mcp/server/file-system foundation & baseline tools (#9750)"
- 2026-04-07T10:40:43Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-07T10:40:45Z

We successfully implemented the file-system MCP server and mapped it to the MCP client configuration. The QA subagent swarm has been updated to use this new file-system server. The playbook is functionally working via the Playwright unit tests. Closing the ticket as the PoC is complete.

- 2026-04-07T10:40:46Z @tobiu closed this issue
- 2026-04-07T11:06:59Z @tobiu referenced in commit `65368bb` - "feat: Global Anti-Hallucination Policy injection in Swarm topology (#9750)"
### @tobiu - 2026-04-07T11:07:10Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ The local File-System MCP and Swarm node architecture is complete and hardened!
> 
> **Key Changes:**
> 1. Built a containerized local backend for MCP file access strictly jailed to the Neo project workspace.
> 2. Corrected the `initAsync()` architectural redundancy bugs.
> 3. Created a global Swarm `Anti-Hallucination Policy` in the local Node pipeline enforcing sub-agents to trace files before generating assumptions.
> 4. Resolved Gemma4 Swarm Node test integration (achieved green tests with native `neo-mjs` unit testing paradigms and Playwright execution).
> 
> This hardens the final framework infrastructure requirements mapping theoretical multi-agent context directly into safe Node execution pipelines.


