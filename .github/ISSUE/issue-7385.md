---
id: 7385
title: '''Sighted'' Agent - Chrome DevTools Integration'
state: OPEN
labels:
  - help wanted
  - good first issue
  - epic
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-06T09:03:06Z'
updatedAt: '2025-10-06T10:40:57Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7385'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 7386
  - 7387
  - 7388
  - 7389
  - 7390
subIssuesCompleted: 2
subIssuesTotal: 5
blockedBy: []
blocking: []
---
# 'Sighted' Agent - Chrome DevTools Integration

This epic covers the integration of the Chrome DevTools Model Context Protocol (MCP) server into the neo.mjs development workflow. The primary goal is to give the AI agent 'sight' by allowing it to programmatically interact with a live browser instance. This will enable a new, interactive development workflow where the agent can:

*   **Continuously verify UI changes:** Inspect the DOM and CSS in real-time during component development.
*   **Generate meaningful Playwright tests:** Leverage its understanding of the UI to create robust Playwright tests.
*   **Debug multi-threaded applications:** Investigate worker and shared worker console access for comprehensive debugging.
*   **Analyze performance and automate user flows:** Utilize advanced DevTools capabilities for performance analysis and UI automation.

This initiative is a critical step towards building a more powerful and autonomous AI-native development environment, transforming the agent from a 'blind' code generator into a 'sighted' development partner.

## Top-Level Items & Implementation Phases

### Phase 1: Initial Integration & Verification
- **Goal:** Configure the MCP server and verify basic connectivity and functionality.

### Phase 2: 'Sighted' Development Workflow
- **Goal:** Integrate browser-based verification into the agent's core development and PR review workflows.

## Sub-Tasks

### Phase 1: Initial Integration & Verification
- **Done:** ticket-configure-mcp-server.md
- **To Do:** ticket-create-mcp-server-guide.md

### Phase 2: 'Sighted' Development Workflow
- **To Do:** ticket-define-sighted-development-workflow.md
- **To Do:** ticket-investigate-worker-console-access-with-mcp.md
- **To Do:** ticket-create-sighted-development-demo.md

## Activity Log

- 2025-10-06 @tobiu assigned to @tobiu
- 2025-10-06 @tobiu added the `epic` label
- 2025-10-06 @tobiu added the `ai` label
- 2025-10-06 @tobiu added the `help wanted` label
- 2025-10-06 @tobiu added the `good first issue` label
- 2025-10-06 @tobiu added the `hacktoberfest` label
- 2025-10-06 @tobiu referenced in commit `d071c95` - "#7385 ticket md files"

