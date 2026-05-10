---
id: 9953
title: MCP Progressive Disclosure Endpoint
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees: []
createdAt: '2026-04-13T09:28:33Z'
updatedAt: '2026-04-13T09:28:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9953'
author: tobiu
commentsCount: 0
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# MCP Progressive Disclosure Endpoint

### Goal
Truncate massive JSON schemas returned by the MCP Server on every turn that exhaust Frontier model context windows.

### Implementation Checklist
- [ ] Create a `get_mcp_tool_handbook(toolId)` native JSON routing endpoint.
- [ ] Truncate all MCP tool `description` fields in the primary server manifests to max 1-2 string sentences.
- [ ] Inject the sophisticated programmatic bounds directly into the handbook, ensuring Agents naturally Lazy-Load the context only when necessary.

## Timeline

- 2026-04-13T09:28:35Z @tobiu added the `enhancement` label
- 2026-04-13T09:28:35Z @tobiu added the `ai` label
- 2026-04-13T09:28:35Z @tobiu added the `architecture` label
- 2026-04-13T09:28:50Z @tobiu added parent issue #9950

