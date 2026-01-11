---
id: 8538
title: Configure MCP Server for Multi-Target Ticket Export (JSON/MD)
state: OPEN
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-11T10:17:25Z'
updatedAt: '2026-01-11T10:17:42Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8538'
author: tobiu
commentsCount: 0
parentIssue: 8537
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Configure MCP Server for Multi-Target Ticket Export (JSON/MD)

Enhance the `neo.mjs-github-workflow` server to support configurable export targets.

**Requirements:**
- Update the server configuration to allow specifying export formats: `markdown` (current), `json` (new structured format), or `all`.
- Implement the logic to serialize GitHub GraphQL responses into the agreed "Hybrid JSON" schema (Structured Metadata + Event Stream + Markdown Body Strings).


## Timeline

- 2026-01-11T10:17:26Z @tobiu added the `enhancement` label
- 2026-01-11T10:17:27Z @tobiu added the `ai` label
- 2026-01-11T10:17:42Z @tobiu assigned to @tobiu
- 2026-01-11T10:17:55Z @tobiu added parent issue #8537

