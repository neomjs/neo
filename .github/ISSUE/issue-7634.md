---
id: 7634
title: 'docs(AGENTS.md): Revise Core Principles & Initialization'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-24T10:43:33Z'
updatedAt: '2025-11-02T09:31:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7634'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-02T09:31:27Z'
---
# docs(AGENTS.md): Revise Core Principles & Initialization

**Reported by:** @tobiu on 2025-10-24

This ticket covers the first phase of rewriting `AGENTS.md` (ticket #7630) as part of the automation epic (#7604). The goal is to modernize the agent's foundational instructions and remove outdated manual setup steps.

**Acceptance Criteria:**
1.  Rewrite Section 1 ("Your Role") to emphasize using the MCP servers and their tools as the primary interface.
2.  Completely rewrite Section 2 ("Session Initialization") to remove all manual `npm run` commands, `curl` health checks, and other setup procedures that are now automated by the MCP servers.
3.  The new initialization protocol should be significantly simpler, reflecting the new automated environment.

