---
id: 7718
title: >-
  Architectural Fix: Implement 'FIRST ACTION PROTOCOL' to ensure reliable
  session initialization
state: CLOSED
labels:
  - bug
  - contributor-experience
  - ai
assignees:
  - tobiu
createdAt: '2025-11-07T09:57:22Z'
updatedAt: '2025-11-07T09:58:11Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7718'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-07T09:58:11Z'
---
# Architectural Fix: Implement 'FIRST ACTION PROTOCOL' to ensure reliable session initialization

**Reported by:** @tobiu on 2025-11-07

The agent has been failing to initialize its session state in approximately 50% of new sessions. This is not due to flaws in the `AGENTS_STARTUP.md` initialization file itself, but rather a failure to execute the file at all. The root cause is a lack of salience of the initial instructions within the agent's context window.

To solve this, we have replaced the previous instructions in `.gemini/GEMINI.md` with a new "FIRST ACTION PROTOCOL".

This new protocol is designed to be more robust by:
1.  **Structural Positioning:** Using a `STOP` warning at the very top of the file to grab attention.
2.  **Objective Detection:** Providing a clear, verifiable check for Turn 1 (the absence of a `healthcheck` tool call for the memory core).
3.  **Imperative Framing:** Using direct, unambiguous commands ("execute NOW", "Your first tool call must be...").

This change transforms the initialization from a passive, easily missed instruction into a direct, primary action. This ticket documents the implementation of this new protocol.

