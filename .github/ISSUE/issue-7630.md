---
id: 7630
title: 'docs: Update AGENTS.md to Reflect MCP Server Architecture'
state: OPEN
labels:
  - documentation
  - enhancement
  - ai
assignees: []
createdAt: '2025-10-24T09:35:51Z'
updatedAt: '2025-10-24T09:35:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7630'
author: tobiu
commentsCount: 0
parentIssue: 7604
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
---
# docs: Update AGENTS.md to Reflect MCP Server Architecture

**Reported by:** @tobiu on 2025-10-24

---

**Parent Issue:** #7604 - Epic: Automate MCP Server Startup and Reduce Agent Protocol

---

The `AGENTS.md` file is critically outdated. It instructs agents to use a series of `npm run ai:*` scripts for core functionalities like querying the knowledge base, managing memory, and creating GitHub issues.

These workflows have been entirely superseded by the new MCP (Model Context Protocol) servers and their corresponding first-class tools (`query_documents`, `add_memory`, `create_issue`, etc.).

**Acceptance Criteria:**

1.  Rewrite the `AGENTS.md` file to remove all references to the old `npm run ai:*` scripts.
2.  Update the "Knowledge Base" section to instruct agents to use the `query_documents` tool.
3.  Update the "Memory Core" section to describe the new workflow using the `add_memory` and `summarize_sessions` tools.
4.  Update the "Ticket-First" Gate section to describe the new workflow using the `create_issue` and `sync_all` tools.
5.  Remove the now-obsolete "Hacktoberfest 2025 Onboarding Protocol".
6.  Ensure the entire document reflects the new, streamlined, tool-based workflow.

