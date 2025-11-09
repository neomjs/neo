---
id: 7694
title: 'Feat: Implement Automatic Agent Initialization via GEMINI.md'
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-11-02T18:38:39Z'
updatedAt: '2025-11-02T18:40:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7694'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-02T18:40:37Z'
---
# Feat: Implement Automatic Agent Initialization via GEMINI.md

**Reported by:** @tobiu on 2025-11-02

This ticket documents the implementation of a robust, automatic initialization process for Gemini agents within the repository. The goal is to ensure the agent follows the instructions in `AGENTS.md` at the start of every session.

The solution uses the CLI's default context-loading mechanism to provide a persistent "pre-flight checklist" to the agent on every turn.

1.  A new file, `.gemini/GEMINI.md`, was created with a "Mandatory Pre-Response Check" that instructs the agent to read and perform the `AGENTS.md` initialization if it hasn't already done so in the current session.
2.  This file also includes a summary of the most critical enforcement rules (e.g., Ticket-First, Memory Core) to reinforce them on every turn.
3.  The `.gemini/settings.json` file remains unchanged, as `GEMINI.md` is the default context file name and is loaded automatically.

This approach ensures that the agent will always perform the correct initialization sequence upon receiving the first user prompt of a session.

