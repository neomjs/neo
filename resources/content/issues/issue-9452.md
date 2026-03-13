---
id: 9452
title: Connection Foundation and Parser Refactoring
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T18:22:48Z'
updatedAt: '2026-03-12T21:06:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9452'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Connection Foundation and Parser Refactoring

### Goal
Establish the `Neo.data.connection.Base` hierarchy and fix the abstraction leak in `Neo.data.parser.Stream` by extracting its network transport logic.

### Context
A Parser should strictly focus on deserialization and shaping data (e.g., converting a text stream into JSON records). Currently, `Neo.data.parser.Stream` has `fetch()` and `AbortController` logic hardcoded into its `read()` method. This makes it a Connection in disguise and violates the single responsibility principle.

### Acceptance Criteria
- Create `src/data/connection/Base.mjs`.
- Refactor `Neo.data.connection.Fetch` and `Xhr` to extend this new Base class.
- Create a new Connection (e.g., `connection.Stream` or enhance `connection.Fetch`) that handles the `fetch()` request and returns the `ReadableStream`.
- Refactor `Neo.data.parser.Stream`: Remove the `fetch()` call. The parser should now accept the `ReadableStream` provided by the Connection, process the NDJSON/JSONL chunks, and yield records.
- Ensure the `Pipeline` class correctly routes the output of the `Connection` into the `Parser`.

## Timeline

- 2026-03-12T18:22:50Z @tobiu added the `enhancement` label
- 2026-03-12T18:22:50Z @tobiu added the `ai` label
- 2026-03-12T18:22:50Z @tobiu added the `architecture` label
- 2026-03-12T18:22:50Z @tobiu added the `core` label
- 2026-03-12T18:23:23Z @tobiu added parent issue #9449
- 2026-03-12T18:24:42Z @tobiu cross-referenced by #9449
- 2026-03-12T18:25:20Z @tobiu assigned to @tobiu
- 2026-03-12T21:02:59Z @tobiu changed title from **Implement Thread-Agnostic Execution Mode for Connections** to **Connection Foundation and Parser Refactoring**

