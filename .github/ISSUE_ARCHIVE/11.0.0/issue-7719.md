---
id: 7719
title: 'Docs: Clarify automatic session summarization in AGENTS_STARTUP.md'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2025-11-08T09:30:54Z'
updatedAt: '2025-11-08T09:32:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7719'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-11-08T09:32:09Z'
---
# Docs: Clarify automatic session summarization in AGENTS_STARTUP.md

**Reported by:** @tobiu on 2025-11-08

The `AGENTS_STARTUP.md` guide incorrectly implies that the agent needs to manually trigger session summarization. This was corrected to clarify that the Memory Core server handles this automatically on startup. The agent's only responsibility is to save its own initialization turn. This change ensures the guide is accurate and prevents confusion.

