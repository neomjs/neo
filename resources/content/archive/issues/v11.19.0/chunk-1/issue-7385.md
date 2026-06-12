---
id: 7385
title: '''Sighted'' Agent - Chrome DevTools Integration'
state: CLOSED
labels:
  - help wanted
  - good first issue
  - epic
  - stale
  - hacktoberfest
  - ai
assignees:
  - tobiu
createdAt: '2025-10-06T09:03:06Z'
updatedAt: '2026-01-09T00:57:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7385'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues:
  - '[x] 7386 Configure MCP Server for Project'
  - '[x] 7387 Create Guide for Chrome DevTools MCP Server'
  - '[x] 7388 Define the "Sighted" Development Workflow'
  - '[x] 7389 Investigate Worker Console Access with MCP'
  - '[x] 7390 Create a "Sighted" Development Demo'
subIssuesCompleted: 5
subIssuesTotal: 5
blockedBy: []
blocking: []
closedAt: '2026-01-09T00:57:44Z'
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

## Timeline

- 2025-10-06T09:03:06Z @tobiu assigned to @tobiu
- 2025-10-06T09:03:07Z @tobiu added the `epic` label
- 2025-10-06T09:03:07Z @tobiu added the `ai` label
- 2025-10-06T09:04:19Z @tobiu added sub-issue #7386
- 2025-10-06T10:29:57Z @tobiu added sub-issue #7387
- 2025-10-06T10:32:45Z @tobiu added the `help wanted` label
- 2025-10-06T10:32:45Z @tobiu added the `good first issue` label
- 2025-10-06T10:32:45Z @tobiu added the `hacktoberfest` label
- 2025-10-06T10:34:37Z @tobiu added sub-issue #7388
- 2025-10-06T10:36:48Z @tobiu added sub-issue #7389
- 2025-10-06T10:38:42Z @tobiu added sub-issue #7390
- 2025-10-06T10:41:42Z @tobiu referenced in commit `d071c95` - "#7385 ticket md files"
### @github-actions - 2026-01-05T03:23:20Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-01-05T03:23:20Z @github-actions added the `stale` label
### @tobiu - 2026-01-09T00:57:19Z

**Input from Gemini 3 Pro:**

> ✦ **Status Update: Obsolete**
> 
> This initiative has been superseded by the **Neural Link** architecture introduced in v11.18.0 and matured in v11.19.0.
> 
> **Rationale:**
> The original goal was to give agents "sight" via the generic Chrome DevTools protocol. However, we found that a native, engine-aware introspection layer (Neural Link) provides vastly superior capabilities:
> 1.  **Scene Graph Awareness:** The Neural Link understands `Neo.component.Base` instances, not just DOM nodes.
> 2.  **State Mutation:** Agents can modify runtime state directly, which DevTools cannot do safely.
> 3.  **Cross-Context:** The Neural Link bridges the Worker boundary natively.
> 
> As of v11.19.0, we have officially removed the Chrome DevTools MCP server from our default configuration in favor of the Neural Link.
> 
> **Action:** Closing as superseded.

- 2026-01-09T00:57:44Z @tobiu closed this issue

