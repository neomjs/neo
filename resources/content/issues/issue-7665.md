---
id: 7665
title: 'Epic: Enhance Knowledge Base MCP with Class Query Tools'
state: OPEN
labels:
  - enhancement
  - epic
  - stale
  - ai
assignees: []
createdAt: '2025-10-26T13:53:16Z'
updatedAt: '2026-01-25T03:23:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7665'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues:
  - '[x] 7664 Docs: Create Codebase Overview Guide'
  - '[x] 7666 Docs: Update AGENTS.md to use new Codebase Overview Guide'
subIssuesCompleted: 2
subIssuesTotal: 2
blockedBy: []
blocking: []
---
# Epic: Enhance Knowledge Base MCP with Class Query Tools

To allow for more efficient and precise exploration of the codebase, the knowledge base MCP server should be enhanced with tools for structured queries against the class hierarchy.

This will enable an agent (or other tools) to get specific information about classes without parsing source files or the `class-hierarchy.yaml` file.

**Key Features:**
- An endpoint to retrieve details for a specific class (e.g., `getClass(className)`), returning its parent class, mixins, and configs.
- An endpoint to query for class relationships (e.g., `findClasses({extends: 'Neo.form.field.Base'})`).
- An endpoint to list all classes within a given namespace.

## Timeline

- 2025-10-26T13:53:17Z @tobiu added the `enhancement` label
- 2025-10-26T13:53:17Z @tobiu added the `epic` label
- 2025-10-26T13:53:17Z @tobiu added the `ai` label
- 2025-10-26T13:54:16Z @tobiu added sub-issue #7664
- 2025-10-26T13:54:38Z @tobiu added sub-issue #7666
### @github-actions - 2026-01-25T03:23:25Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-01-25T03:23:25Z @github-actions added the `stale` label

