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
  - 7626
  - 7630
  - 7631
  - 7658
  - 7659
  - 7660
  - 7661
  - 7662
subIssuesCompleted: 8
subIssuesTotal: 8
closedAt: '2025-10-26T16:16:16Z'
---
# Epic: Automate MCP Server Startup and Reduce Agent Protocol

**Reported by:** @tobiu on 2025-10-22

---

**Sub-Issues:** #7626, #7630, #7631, #7658, #7659, #7660, #7661, #7662
**Progress:** 8/8 completed (100%)

---

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

