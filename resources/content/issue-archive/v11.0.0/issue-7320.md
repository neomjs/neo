---
id: 7320
title: Update Agent Workflow for Memory
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-01T20:56:49Z'
updatedAt: '2025-10-03T10:14:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7320'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-03T10:14:47Z'
---
# Update Agent Workflow for Memory

With the memory capture and query tools in place, this ticket involves updating the agent's core instructions (`AGENTS.md`) to integrate this new capability into its standard workflow.

## Acceptance Criteria

1.  The `AGENTS.md` file is updated with a new section describing the two-stage query process.
2.  The new protocol instructs the agent to:
    a.  First, query the framework knowledge base (`npm run ai:query`) for technical implementation details.
    b.  Second, query the memory database (`npm run ai:query-memory`) for historical context, past decisions, and user requirements related to the current task.
3.  The guidelines should emphasize how to synthesize information from both sources to make more informed decisions.

## Timeline

- 2025-10-01T20:56:49Z @tobiu assigned to @tobiu
- 2025-10-01T20:56:50Z @tobiu added the `enhancement` label
- 2025-10-01T20:56:50Z @tobiu added parent issue #7316
- 2025-10-02T12:37:53Z @tobiu referenced in commit `1620956` - "#7320 early draft version inside a tmp file"
- 2025-10-03T09:40:15Z @tobiu referenced in commit `dd5fbbe` - "Update Agent Workflow for Memory #7320"
- 2025-10-03T10:14:47Z @tobiu closed this issue

