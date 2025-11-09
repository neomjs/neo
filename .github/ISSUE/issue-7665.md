---
id: 7665
title: 'Epic: Enhance Knowledge Base MCP with Class Query Tools'
state: OPEN
labels:
  - enhancement
  - epic
  - ai
assignees: []
createdAt: '2025-10-26T13:53:16Z'
updatedAt: '2025-10-26T13:53:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7665'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - 7664
  - 7666
subIssuesCompleted: 2
subIssuesTotal: 2
---
# Epic: Enhance Knowledge Base MCP with Class Query Tools

**Reported by:** @tobiu on 2025-10-26

---

**Sub-Issues:** #7664, #7666
**Progress:** 2/2 completed (100%)

---

To allow for more efficient and precise exploration of the codebase, the knowledge base MCP server should be enhanced with tools for structured queries against the class hierarchy.

This will enable an agent (or other tools) to get specific information about classes without parsing source files or the `class-hierarchy.yaml` file.

**Key Features:**
- An endpoint to retrieve details for a specific class (e.g., `getClass(className)`), returning its parent class, mixins, and configs.
- An endpoint to query for class relationships (e.g., `findClasses({extends: 'Neo.form.field.Base'})`).
- An endpoint to list all classes within a given namespace.

