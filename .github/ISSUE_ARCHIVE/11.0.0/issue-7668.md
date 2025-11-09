---
id: 7668
title: 'Epic: Make Knowledge Base Tools Self-Documenting'
state: CLOSED
labels:
  - documentation
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2025-10-27T08:50:15Z'
updatedAt: '2025-10-27T09:06:19Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7668'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 7669
  - 7670
subIssuesCompleted: 2
subIssuesTotal: 2
closedAt: '2025-10-27T09:06:19Z'
---
# Epic: Make Knowledge Base Tools Self-Documenting

**Reported by:** @tobiu on 2025-10-27

---

**Sub-Issues:** #7669, #7670
**Progress:** 2/2 completed (100%)

---

To streamline agent instructions and reduce the size of AGENTS.md, we need to move tool-specific documentation directly into the tool definitions themselves. This makes the tools self-sufficient and easier to understand.

This epic covers the work to enhance the OpenAPI specification for the Knowledge Base server, making its tools, especially `query_documents`, fully self-documenting.

