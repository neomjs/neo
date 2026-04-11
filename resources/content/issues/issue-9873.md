---
id: 9873
title: Refactor Agent Startup Workflow to Prevent Premature UI Guide Loading
state: CLOSED
labels:
  - bug
  - ai
assignees: []
createdAt: '2026-04-11T07:58:21Z'
updatedAt: '2026-04-11T08:02:59Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9873'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-11T08:02:59Z'
---
# Refactor Agent Startup Workflow to Prevent Premature UI Guide Loading

### The Problem
During the mandatory initialization sequence defined in `AGENTS_STARTUP.md`, Step 4 dictates that the agent should read `learn/gettingstarted/DescribingTheUI.md`. However, at this specific point in the boot cycle, the agent has not yet fetched the Context Frontier or interacting with the user to determine if the task actually involves frontend UI components. Reading UI guides prematurely when the task might be backend or infrastructure-related wastes cognitive bandwidth and violates context scoping protocols. 

### The Architectural Reality
The current instructions linearly enforce frontend document processing before the Memory Core determines the strategic task. This must be decoupled. This flaw has caused agents in past sessions to pollute their initial context window with UI assumptions.

### The Solution Implementation
1. Remove `Step 4: Understand the Two Component Models` from the rigid, domain-agnostic session initialization loop in `AGENTS_STARTUP.md`.
2. Reposition the requirement to read `DescribingTheUI.md` as a conditional mandate inside the **Implementation Loop** (Section 4), explicitly stating that the document should only be loaded after the agent confirms the task involves frontend DOM/VDOM components.
This ensures the session initialization remains lean and task-agnostic.

## Timeline

- 2026-04-11T07:58:23Z @tobiu added the `bug` label
- 2026-04-11T07:58:23Z @tobiu added the `ai` label
- 2026-04-11T07:59:15Z @tobiu referenced in commit `3895417` - "docs: Refactor Agent Startup Workflow to delay UI Guide loading (#9873)"
- 2026-04-11T07:59:35Z @tobiu cross-referenced by PR #9874
- 2026-04-11T08:02:59Z @tobiu referenced in commit `bfc374c` - "docs: Refactor Agent Startup Workflow to delay UI Guide loading (#9873) (#9874)"
- 2026-04-11T08:03:00Z @tobiu closed this issue
- 2026-04-11T08:26:16Z @tobiu referenced in commit `d1aa13a` - "Docs: Refine AI infrastructure scale and boundaries in CodebaseOverview (#9876)

* docs: Refactor Agent Startup Workflow to delay UI Guide loading (#9873)

* docs: Refine AI infrastructure scale and boundaries in CodebaseOverview (#9875)"

