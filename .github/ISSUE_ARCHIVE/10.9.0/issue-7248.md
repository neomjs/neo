---
id: 7248
title: Clarify Agent Workflow Transition
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2025-09-24T09:10:14Z'
updatedAt: '2025-09-24T09:18:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7248'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-09-24T09:18:19Z'
---
# Clarify Agent Workflow Transition

**Reported by:** @tobiu on 2025-09-24

To prevent future process errors, a clarification will be added to the `AGENTS.md` file. This change addresses a specific failure pattern where a conceptual discussion that transitions into an actionable file modification request was not being preceded by a new ticket.

## Goal

Add a note to the "Actionable/Modification" section of the Development Workflow in `AGENTS.md`. This note will explicitly state that when a conversation shifts from brainstorming ("what if we...") to implementation ("let's do..."), it must be treated as a new actionable request that requires a ticket before any modifications are made.

