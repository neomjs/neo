---
id: 8285
title: Reinforce 'add_memory' usage via Tool Description and Agents Protocol
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-01-02T03:50:31Z'
updatedAt: '2026-01-02T03:52:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8285'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-01-02T03:52:41Z'
---
# Reinforce 'add_memory' usage via Tool Description and Agents Protocol

The agent frequently forgets to call `add_memory` in the middle of sessions or when rushing to complete a task. To improve compliance without waiting for future architectural changes, we will strengthen the instructions in two places:

1. **Tool Description (`ai/mcp/server/memory-core/openapi.yaml`):**
   - Update the `add_memory` description to be more imperative.
   - Explicitly state: "**MANDATORY FINAL STEP:** You MUST call this tool at the end of every turn, *before* generating your final response to the user."

2. **Agents Protocol (`AGENTS.md`):**
   - Refine the "Consolidate-Then-Save" section to emphasize that `add_memory` is the *gate* for the final response.

**Goal:** Increase the reliability of session persistence by making the requirement more salient during tool selection.

## Timeline

- 2026-01-02T03:50:32Z @tobiu added the `documentation` label
- 2026-01-02T03:50:32Z @tobiu added the `enhancement` label
- 2026-01-02T03:50:32Z @tobiu added the `ai` label
- 2026-01-02T03:51:30Z @tobiu assigned to @tobiu
- 2026-01-02T03:52:25Z @tobiu referenced in commit `02e88b1` - "Reinforce 'add_memory' usage via Tool Description and Agents Protocol #8285"
- 2026-01-02T03:52:41Z @tobiu closed this issue

