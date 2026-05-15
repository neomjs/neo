---
id: 7901
title: Split Playwright tests into granular knowledge base chunks for better retrieval
state: CLOSED
labels:
  - enhancement
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2025-11-25T14:01:02Z'
updatedAt: '2025-11-25T14:42:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/7901'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2025-11-25T14:42:12Z'
---
# Split Playwright tests into granular knowledge base chunks for better retrieval

Currently, `test/playwright` files are indexed as single monolithic chunks. This dilutes the semantic signal of individual test cases, making it harder for the vector search to find specific testing patterns.

**Goal:**
Decompose test files into smaller, semantically distinct chunks to improve search scoring and relevance.

**Requirements:**
1.  **File-Level Context Chunk:**
    -   Create a dedicated chunk for the file's "header".
    -   **Content:** Top-level comments, imports, and outer `test.describe` descriptions.
    -   **Purpose:** Captures high-level intent (e.g., "Grid Filtering Tests") and shared context.

2.  **Test-Case Chunks:**
    -   Parse individual `test('description', ...)` blocks.
    -   Create a separate chunk for each test case.
    -   **Content:** The test description + the full function body.
    -   **Name:** `[RelativePath] - [Test Description]`.

3.  **Location Metadata (New):**
    -   Calculate and store `line_start` and `line_end` for each test chunk.
    -   **Benefit:** Enables agents to pinpoint the exact location of a test within a large file, allowing for targeted `read_file` operations (using `offset`/`limit`) when safe to do so.

4.  **Source Mapping:**
    -   All chunks must retain the exact `source` property pointing to the original `.spec.mjs` file.


## Timeline

- 2025-11-25T14:01:03Z @tobiu added the `enhancement` label
- 2025-11-25T14:01:03Z @tobiu added the `ai` label
- 2025-11-25T14:01:03Z @tobiu added the `testing` label
- 2025-11-25T14:02:09Z @tobiu assigned to @tobiu
- 2025-11-25T14:33:01Z @tobiu referenced in commit `06c2c4a` - "Split Playwright tests into granular chunks for improved Knowledge Base indexing #7901

- Added 'acorn' dependency to DatabaseService.mjs for robust AST parsing.
- Implemented 'parseTestFile' to extract:
  - A 'header' chunk (imports, setup, top-level context).
  - Individual 'test-case' chunks for each test() block.
  - Line number metadata (line_start, line_end) for each test.
- Updated 'indexRawDirectory' to utilize the new parsing logic for Playwright .spec.mjs files.
- This enhancement ensures vector search retrieves specific test cases rather than monolithic files."
### @tobiu - 2025-11-25T14:41:53Z

**Input from Neo Agent:**

> ◆ I have verified the implementation by performing a full rebuild of the Knowledge Base.
> 
> **Verification Results:**
> - **Chunk Generation:** The process successfully parsed Playwright test files, generating granular chunks for individual test cases and file-level headers.
> - **Total Chunks:** The database size increased from 7,252 to 7,448 chunks, reflecting the increased granularity of the test suite indexing.
> - **Embedding:** The synchronization script successfully computed and upserted embeddings for all new and modified chunks.
> 
> The system is now correctly indexing `test/playwright` with the new granular structure and metadata.

- 2025-11-25T14:42:12Z @tobiu closed this issue

