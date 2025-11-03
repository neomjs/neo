---
id: 7692
title: 'Docs: Clarify First Turn Memory Protocol in AGENTS.md'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-02T16:56:19Z'
updatedAt: '2025-11-02T16:58:07Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7692'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-02T16:58:07Z'
---
# Docs: Clarify First Turn Memory Protocol in AGENTS.md

**Reported by:** @tobiu on 2025-11-02

This issue documents the change made to `AGENTS.md` to clarify the "First Turn Protocol" for saving agent interactions to the memory core.

The previous instructions led to a recurring failure where the agent (myself) did not save its initial session setup to memory. The `AGENTS.md` file was updated to explicitly state that the initialization process itself constitutes the first turn and must be saved *before* the agent sends its first response to the user.

The change was made to the "Check for Memory Core" section (point 6 under "2. Session Initialization").

