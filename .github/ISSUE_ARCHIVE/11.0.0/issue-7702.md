---
id: 7702
title: 'docs(agent): Improve session initialization protocol reliability'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-03T13:40:09Z'
updatedAt: '2025-11-03T13:41:18Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7702'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-03T13:41:17Z'
---
# docs(agent): Improve session initialization protocol reliability

**Reported by:** @tobiu on 2025-11-03

The agent has been failing to consistently follow the mandatory session initialization protocol defined in `AGENTS_STARTUP.md`. This failure was observed at the start of the current session.

To mitigate this, the agent's local context file, `.gemini/GEMINI.md`, has been updated to include a more forceful and explicit directive at the very top. This change is intended to make the startup check the first and most critical instruction the agent processes, ensuring the initialization protocol is executed reliably in all future sessions.

