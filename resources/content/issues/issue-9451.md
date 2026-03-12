---
id: 9451
title: Create Connection.Base and Establish Connection -> Parser Hierarchy
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
  - core
assignees:
  - tobiu
createdAt: '2026-03-12T18:22:38Z'
updatedAt: '2026-03-12T18:25:16Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9451'
author: tobiu
commentsCount: 0
parentIssue: 9449
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
---
# Create Connection.Base and Establish Connection -> Parser Hierarchy

### Goal
Create `Neo.data.connection.Base` to act as the root class for all network transports (Fetch, Xhr, WebSocket) and establish the architectural hierarchy where the Connection owns the Parser.

### Context
Currently, the new `Parser` logic is doing the `fetch` and maintaining the `AbortController` natively (e.g. `parser.Stream`). This breaks the Single Responsibility Principle. The Parser should only handle data deserialization, while a `Connection` should handle the transport.

Furthermore, we currently have `connection.Fetch` and `connection.Xhr`, but no unified `connection.Base` to manage the lifecycle and the hierarchical configurations.

### Acceptance Criteria
- Create `src/data/connection/Base.mjs`.
- Refactor `Neo.data.connection.Fetch` and `Xhr` to extend this new Base class.
- The `Connection` Base class must accept a `parser_` reactive config.
- The `Connection` should be responsible for executing the network request and piping the resulting stream/data into its `parser`.

## Timeline

- 2026-03-12T18:22:40Z @tobiu added the `enhancement` label
- 2026-03-12T18:22:40Z @tobiu added the `ai` label
- 2026-03-12T18:22:40Z @tobiu added the `architecture` label
- 2026-03-12T18:22:40Z @tobiu added the `core` label
- 2026-03-12T18:23:17Z @tobiu added parent issue #9449
- 2026-03-12T18:24:42Z @tobiu cross-referenced by #9449
- 2026-03-12T18:25:16Z @tobiu assigned to @tobiu

