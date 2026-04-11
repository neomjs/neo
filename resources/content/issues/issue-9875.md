---
id: 9875
title: 'Docs: Refine AI infrastructure scale and boundaries in CodebaseOverview'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-11T08:21:40Z'
updatedAt: '2026-04-11T08:26:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9875'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-11T08:26:16Z'
---
# Docs: Refine AI infrastructure scale and boundaries in CodebaseOverview

### Description
The `CodebaseOverview.md` guide is outdated regarding the current AI infrastructure topology and scale.

### Proposed Changes
- Enhance the MCP Server section to outline the expansion from 3 to 5 active servers (adding the Neural Link server and the File System server specifically optimized for Neo local agents, distinguishing them from generic Claude/Gemini CLI file tools).
- Explicitly document the architectural boundary between the Browser-based Frontend Application Engine and the Node.js Agent OS SDK, clarifying that they remain isolated and bridge exclusively via the Neural Link using JSON-RPC.
- Enhance Neural Link details to encompass Whitebox E2E testing capabilities along with standard introspection.
- Update the Memory Core/DreamService overview to detail the Hybrid RAG implementation, the transition to the SQLite-based Native Graph DB, and the integration of local SLMs like `gemma4-31b` for Subagents and the Librarian daemon.

## Timeline

- 2026-04-11T08:21:42Z @tobiu added the `documentation` label
- 2026-04-11T08:21:42Z @tobiu added the `enhancement` label
- 2026-04-11T08:21:42Z @tobiu added the `ai` label
- 2026-04-11T08:22:31Z @tobiu referenced in commit `0374e0a` - "docs: Refine AI infrastructure scale and boundaries in CodebaseOverview (#9875)"
- 2026-04-11T08:22:59Z @tobiu cross-referenced by PR #9876
- 2026-04-11T08:26:16Z @tobiu closed this issue
- 2026-04-11T08:26:16Z @tobiu referenced in commit `d1aa13a` - "Docs: Refine AI infrastructure scale and boundaries in CodebaseOverview (#9876)

* docs: Refactor Agent Startup Workflow to delay UI Guide loading (#9873)

* docs: Refine AI infrastructure scale and boundaries in CodebaseOverview (#9875)"

