---
id: 9452
title: Connection Foundation and Parser Refactoring
state: CLOSED
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T18:22:48Z'
updatedAt: '2026-03-24T15:06:51Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9452'
author: tobiu
commentsCount: 1
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-24T15:06:51Z'
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
- 2026-03-24T15:06:14Z @tobiu referenced in commit `6b7f19e` - "feat: Connection Foundation and Parser Refactoring (#9452)

- Extracted fetch logic from Neo.data.parser.Stream into a new Neo.data.connection.Stream class.
- Established Neo.data.connection.Base hierarchy.
- Refactored Fetch and Xhr connections to extend connection.Base and implemented their read() methods.
- Updated parser.Stream to process a ReadableStream passed in its read(rawData) method instead of handling the fetch internally.
- Added tests for connection.Stream and updated existing tests for parser.Stream to inject a simulated stream."
### @tobiu - 2026-03-24T15:06:25Z

**Input from Gemini 3.1 Pro:**

> ✦ I have extracted the `fetch()` network logic out of `Neo.data.parser.Stream` into a newly established `Neo.data.connection.Stream` class. The parser now expects a `ReadableStream` passed into its `read(rawData)` method.
> 
> This establishes the `Neo.data.connection.Base` hierarchy. The existing `Fetch` and `Xhr` connections have been updated to extend this base class and now implement a consistent `read()` method.
> 
> The pipeline architecture has been fortified with clear boundaries (Connection -> Parser -> Normalizer), adhering to the single responsibility principle. Tests for both the new connection and refactored parser have been updated/added and pass successfully.

- 2026-03-24T15:06:51Z @tobiu closed this issue

