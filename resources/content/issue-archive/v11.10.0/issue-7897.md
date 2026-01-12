---
id: 7897
title: Index `test/playwright/` in Knowledge Base as raw source
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-11-24T12:37:29Z'
updatedAt: '2025-11-24T13:07:24Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7897'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-24T13:02:44Z'
---
# Index `test/playwright/` in Knowledge Base as raw source

# Index `test/playwright/` in Knowledge Base as raw source

The `test/playwright/` directory contains the automated testing suite. This content is vital for the AI agent to understand how to write and maintain tests for the framework.

Unlike the `ai/` directory, this content:
1.  Does **NOT** need to be in the public Docs App.
2.  Does **NOT** follow the strict class-based structure required by JSDoc.
3.  Should be indexed as raw source files with a new type: `test`.

## Goal
Enhance `DatabaseService.mjs` to explicitly scan and index the `test/playwright` directory.

## Tasks
- [ ] Update `ai/mcp/server/knowledge-base/openapi.yaml` to include `test` as a valid `type` enum for the `query_documents` tool.
- [ ] Modify `ai/mcp/server/knowledge-base/services/DatabaseService.mjs` to:
    - Implement a `indexRawDirectory` method (or similar) to scan a directory recursively.
    - Call this method for `test/playwright` during the `createKnowledgeBase` process.
    - Assign the `type: 'test'` to these chunks.
    - **Note:** There are no `node_modules` inside `test/playwright`, so no exclusion is needed for that.


## Timeline

- 2025-11-24T12:37:30Z @tobiu added the `enhancement` label
- 2025-11-24T12:37:30Z @tobiu added the `ai` label
- 2025-11-24T12:37:30Z @tobiu added the `testing` label
- 2025-11-24T13:00:11Z @tobiu assigned to @tobiu
- 2025-11-24T13:01:02Z @tobiu referenced in commit `861b526` - "Index test/playwright/ in Knowledge Base as raw source #7897"
- 2025-11-24T13:02:44Z @tobiu closed this issue
### @tobiu - 2025-11-24T13:07:23Z

**Input from Gemini:**

> ✦ The implementation is complete and verified.
> 
> **Changes:**
> 1.  **Documentation (`ai` directory):**
>     *   Modified `buildScripts/docs/jsdocx.mjs` to include `ai/**/*.mjs`.
>     *   Added logic to correctly map the `ai` directory to the `Neo.ai` namespace in the JSDoc output.
>     *   Fixed multiple invalid JSDoc type definitions in AI services to ensure successful parsing.
>     *   Verified that `docs/output/all.json` now contains `Neo.ai` entries.
> 
> 2.  **Tests (`test/playwright` directory):**
>     *   Updated `ai/mcp/server/knowledge-base/openapi.yaml` to add `test` as a valid query type.
>     *   Enhanced `DatabaseService.mjs` with `indexRawDirectory` to scan and index the `test/playwright` folder as raw source files with `type: 'test'`.
> 
> **Verification:**
> *   A Knowledge Base sync was performed using the Code Execution pattern (`sync_knowledge_base.mjs`).
> *   Manual testing in a parallel session confirmed that queries with `type: 'test'` correctly return relevant Playwright specs (e.g., `test/playwright/unit/button/Base.spec.mjs` for query "button").
> 
> The Knowledge Base now covers the SDK, MCP servers, and the automated testing suite.


