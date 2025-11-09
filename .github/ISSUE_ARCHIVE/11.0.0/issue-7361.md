---
id: 7361
title: Clarify Agent Memory Server Port in AGENTS.md
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2025-10-05T08:55:26Z'
updatedAt: '2025-10-05T08:58:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7361'
author: tobiu
commentsCount: 0
parentIssue: 7316
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
closedAt: '2025-10-05T08:58:21Z'
---
# Clarify Agent Memory Server Port in AGENTS.md

**Reported by:** @tobiu on 2025-10-05

---

**Parent Issue:** #7316 - AI Knowledge Evolution

---

The `AGENTS.md` file currently implies the agent should check for the memory core server on the default port 8000. However, the knowledge base server runs on port 8000, and the memory server runs on port 8001. This ambiguity can lead to incorrect server checks during the agent's initialization process.

## Goal

Update `AGENTS.md` to clearly state that the memory server runs on port 8001 and ensure the health check command targets the correct port. This will improve the reliability of the agent's session initialization.

