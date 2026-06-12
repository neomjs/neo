---
id: 7604
title: 'Epic: Automate MCP Server Startup and Reduce Agent Protocol'
state: CLOSED
labels:
  - enhancement
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-22T11:43:55Z'
updatedAt: '2025-10-26T16:16:23Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7604'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 7626 Cache Viewer Permission on Server Startup'
  - '[x] 7630 docs: Update AGENTS.md to Reflect MCP Server Architecture'
  - '[x] 7631 refactor: Remove obsolete buildScripts/ai directory'
  - '[x] 7658 Refactor: Simplify Memory Core Protocol in AGENTS.md'
  - '[x] 7659 Docs: Create Self-Explanatory Tools via OpenAPI Descriptions'
  - '[x] 7660 Refine Memory Protocol: Define a "Turn" and Consolidate Sub-Turns'
  - '[x] 7661 Refine Memory Protocol: Clarify Recovery and Prevent Skipped Turns'
  - '[x] 7662 Docs: Add Communication Style Directive to AGENTS.md'
subIssuesCompleted: 8
subIssuesTotal: 8
blockedBy: []
blocking: []
closedAt: '2025-10-26T16:16:16Z'
---
# Epic: Automate MCP Server Startup and Reduce Agent Protocol

The current `AGENTS.md` file contains a significant number of manual steps that the AI agent must perform at the beginning of each session, such as checking if servers are running and triggering summarization. This process is brittle and places a high cognitive load on the agent.

This epic covers automating these startup procedures within the MCP servers themselves, with the primary goal of reducing the length and complexity of `AGENTS.md` by at least 70%.

## Key Initiatives

1.  **Memory Core Automation:**
    -   The `memory-core` server should automatically ensure its ChromaDB instance is running on startup.
    -   The server should automatically trigger the session summarization process on startup, removing the need for the agent to run `npm run ai:summarize-session`.

2.  **Knowledge Base Automation:**
    -   The `knowledge-base` server should automatically ensure its ChromaDB instance is running on startup.

3.  **Protocol Simplification:**
    -   Refactor `AGENTS.md` to remove all instructions related to manual server checks and startup procedures.
    -   The agent's initialization process should be simplified to just connecting to the running servers.

## Benefits

-   **Reduced Agent Complexity:** Drastically simplifies the agent's bootstrap process.
-   **Increased Reliability:** Automating these steps makes the system more robust and less prone to user or agent error.
-   **Faster Session Startup:** Reduces the number of commands and checks required to start a new session.

## Timeline

- 2025-10-22T11:43:56Z @tobiu added the `enhancement` label
- 2025-10-22T11:43:57Z @tobiu added the `epic` label
- 2025-10-22T11:43:57Z @tobiu added the `ai` label
- 2025-10-23T15:06:26Z @tobiu added sub-issue #7626
- 2025-10-23T15:06:26Z @tobiu cross-referenced by #7626
- 2025-10-24T09:37:00Z @tobiu added sub-issue #7630
- 2025-10-24T10:15:32Z @tobiu added sub-issue #7631
- 2025-10-24T10:43:34Z @tobiu cross-referenced by #7634
- 2025-10-26T09:53:17Z @tobiu cross-referenced by #7658
- 2025-10-26T09:53:48Z @tobiu added sub-issue #7658
- 2025-10-26T09:54:05Z @tobiu cross-referenced by #7659
- 2025-10-26T09:54:38Z @tobiu added sub-issue #7659
- 2025-10-26T10:21:06Z @tobiu added sub-issue #7660
- 2025-10-26T10:34:24Z @tobiu added sub-issue #7661
- 2025-10-26T11:37:39Z @tobiu added sub-issue #7662
- 2025-10-26T13:53:16Z @tobiu cross-referenced by #7664
- 2025-10-26T16:16:16Z @tobiu closed this issue
- 2025-10-26T16:16:23Z @tobiu assigned to @tobiu

