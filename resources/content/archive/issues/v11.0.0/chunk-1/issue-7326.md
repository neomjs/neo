---
id: 7326
title: Document Optional Memory Core Setup
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-10-02T12:54:02Z'
updatedAt: '2025-10-02T12:55:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7326'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-10-02T12:55:40Z'
---
# Document Optional Memory Core Setup

To make the AI agent's memory core an optional, opt-in feature, this ticket covers the creation of documentation for developers on how to set up and enable it.

This documentation will be added to `AI_QUICK_START.md` and will serve as the primary guide for developers who wish to utilize the agent's memory capabilities.

## Acceptance Criteria

1.  A new section is added to `AI_QUICK_START.md` titled "Optional: Enable Agent Memory Core."
2.  This section provides clear, step-by-step instructions for:
    a.  Starting the dedicated ChromaDB memory server (`npm run ai:server-memory`).
    b.  Initializing the memory collection (`npm run ai:setup-memory-db`).
3.  The documentation emphasizes that this is an optional feature and explains its benefits.

## Timeline

- 2025-10-02T12:54:02Z @tobiu assigned to @tobiu
- 2025-10-02T12:54:04Z @tobiu added parent issue #7316
- 2025-10-02T12:54:04Z @tobiu added the `enhancement` label
- 2025-10-02T12:55:26Z @tobiu referenced in commit `decee54` - "Document Optional Memory Core Setup #7326"
- 2025-10-02T12:55:40Z @tobiu closed this issue

