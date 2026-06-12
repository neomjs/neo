---
id: 7903
title: Refactor Knowledge Base crawling logic into Source Providers
state: CLOSED
labels:
  - ai
  - refactoring
assignees:
  - tobiu
createdAt: '2025-11-25T15:44:03Z'
updatedAt: '2025-11-25T16:16:35Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7903'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-25T16:16:35Z'
---
# Refactor Knowledge Base crawling logic into Source Providers

**Goal:** Further decouple `DatabaseService.mjs` by extracting the crawling and iteration logic into dedicated `Source` classes. This respects the Single Responsibility Principle: `DatabaseService` should manage the DB, while Sources should know how to find and extract content.

**Architecture:**
- Create a new namespace `Neo.ai.mcp.server.knowledge-base.source`.
- **File Location:** `ai/mcp/server/knowledge-base/source/` (Sibling to `services/` and `parser/`).
- Each Source class should be a **Neo.core.Base singleton**.

**New Classes:**
1.  `source/Base.mjs`: Abstract base class defining the `extract(writeStream)` contract.
2.  `source/ApiSource.mjs`: Handles `docs/output/all.json` iteration -> Uses `ApiParser`.
3.  `source/LearningSource.mjs`: Handles `learn/tree.json` and `learn/` traversal -> Uses `DocumentationParser`.
4.  `source/ReleaseNotesSource.mjs`: Handles `.github/RELEASE_NOTES` scanning.
5.  `source/TicketSource.mjs`: Handles `.github/ISSUE_ARCHIVE` scanning.
6.  `source/TestSource.mjs`: Handles `test/playwright` scanning -> Uses `TestParser`.

**Impact:**
`DatabaseService.createKnowledgeBase` will become a simple loop that delegates extraction to these sources, removing all file-system traversal logic from the core service.

## Timeline

- 2025-11-25T15:44:05Z @tobiu added the `ai` label
- 2025-11-25T15:44:05Z @tobiu added the `refactoring` label
- 2025-11-25T15:44:22Z @tobiu assigned to @tobiu
- 2025-11-25T16:13:11Z @tobiu referenced in commit `9dd9549` - "Refactor Knowledge Base crawling logic into Source Providers #7903"
### @tobiu - 2025-11-25T16:14:22Z

**Input from Neo Agent:**

> ◆ I have successfully implemented the refactoring of the Knowledge Base parsing and crawling logic.
> 
> **Verification Results:**
> - **Architecture:** The system now uses dedicated `Parser` and `Source` singletons, decoupling content extraction from the `DatabaseService`.
> - **Parsing:** Playwright tests are correctly decomposed into granular chunks with line number metadata.
> - **Crawling:** The new `Source` classes (`ApiSource`, `LearningSource`, etc.) correctly iterate their respective domains.
> - **Sync:** A full manual database synchronization was performed, confirming that the new architecture correctly rebuilds the `ai-knowledge-base.jsonl` file and updates ChromaDB (7448 chunks).
> 
> The codebase is now significantly cleaner, adhering to SRP and better prepared for future content types.

- 2025-11-25T16:16:36Z @tobiu closed this issue

