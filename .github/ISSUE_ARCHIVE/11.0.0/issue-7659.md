---
id: 7659
title: 'Docs: Create Self-Explanatory Tools via OpenAPI Descriptions'
state: CLOSED
labels:
  - documentation
  - enhancement
  - developer-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-10-26T09:54:04Z'
updatedAt: '2025-10-26T12:03:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7659'
author: tobiu
commentsCount: 0
parentIssue: 7604
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-26T12:03:37Z'
---
# Docs: Create Self-Explanatory Tools via OpenAPI Descriptions

**Reported by:** @tobiu on 2025-10-26

---

**Parent Issue:** #7604 - Epic: Automate MCP Server Startup and Reduce Agent Protocol

---

This ticket is a sub-task of the epic #7604.

To reduce the complexity of `AGENTS.md`, we will move detailed tool documentation directly into the tool descriptions themselves within the OpenAPI specifications. This will make the tools "self-explanatory".

**Vision:**

The `openapi.yaml` file for each MCP server should become the single source of truth for how to use its tools. An agent should be able to learn how to use a tool just by reading its description.

**Requirements for each tool's description:**

1.  A clear summary of what the tool does.
2.  A "When to Use" section with specific scenarios.
3.  Detailed examples of how to call the tool, including parameters.
4.  Clear explanations of the tool's output.

`AGENTS.md` will then be refactored into a higher-level document that directs agents to explore the tools and their embedded documentation.

**Acceptance Criteria:**

1.  Review and update the `openapi.yaml` for all three MCP servers (`knowledge-base`, `memory-core`, `github-workflow`).
2.  Ensure the `description` for every tool is comprehensive enough to not require external documentation.
3.  Add rich, practical examples to the descriptions.

