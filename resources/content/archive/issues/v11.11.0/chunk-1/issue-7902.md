---
id: 7902
title: Refactor Knowledge Base parsing logic into domain-specific Singletons
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-25T14:57:35Z'
updatedAt: '2025-11-25T15:33:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7902'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-25T15:33:44Z'
---
# Refactor Knowledge Base parsing logic into domain-specific Singletons

**Goal:** Decompose the "God Class" `DatabaseService.mjs` by extracting parsing logic into dedicated, domain-intent focused classes.

**Architecture:** 
- Create a new namespace `Neo.ai.mcp.server.knowledge_base.parser`.
- Ensure all new parsers are **Neo.core.Base singletons**.

**New Classes:**
1.  `parser/TestParser.mjs`: 
    - **Intent:** Extract knowledge from automated tests.
    - **Scope:** Move the `parseTestFile` logic and `acorn` dependency here.

2.  `parser/DocumentationParser.mjs`: 
    - **Intent:** Extract knowledge from written guides and learning content.
    - **Scope:** Move the Markdown section-splitting logic here.

3.  `parser/ApiParser.mjs`: 
    - **Intent:** Extract knowledge from the codebase structure (API).
    - **Scope:** Move the `docs/output/all.json` processing logic here.

**Impact:** 
`DatabaseService.mjs` should become an orchestrator that delegates to these services, significantly reducing its LOC and complexity to a manageable level.

## Timeline

- 2025-11-25T14:57:36Z @tobiu added the `ai` label
- 2025-11-25T14:57:36Z @tobiu added the `refactoring` label
- 2025-11-25T15:00:41Z @tobiu assigned to @tobiu
- 2025-11-25T15:33:23Z @tobiu referenced in commit `c14cbc7` - "Refactor Knowledge Base parsing logic into domain-specific Singletons #7902"
- 2025-11-25T15:33:44Z @tobiu closed this issue

