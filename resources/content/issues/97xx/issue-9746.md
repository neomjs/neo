---
id: 9746
title: Isolate AI unit test artifacts to local tmp directory
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-06T19:58:33Z'
updatedAt: '2026-04-06T20:00:14Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9746'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T20:00:14Z'
---
# Isolate AI unit test artifacts to local tmp directory

### Description
Currently, Playwright unit tests for the AI memory-core components (`DreamService`, `FileSystemIngestor`, `GraphService`, etc.) are leaking artifacts such as SQLite test databases and mock markdown files into the `os.tmpdir()` and occasionally the true repository root if path resolution fails.

This is causing file pollution during local test executions and potential test-suite fragility.

### Required Changes
1. Refactor test suite `aiConfig` overrides (e.g., `testDbPath`, `mockFsRoot`, `handoffFilePath`) to map exclusively to `<rootDir>/tmp/`.
2. Introduce inline logical checks during test setup (`beforeAll`/`beforeEach`) to automatically `fs.mkdirSync` the `tmp` folder if it doesn't already exist.
3. Ensure the isolated tests cleanly self-destruct their specific SQLite files inside `tmp` during `afterAll` checks.

## Timeline

- 2026-04-06T19:58:34Z @tobiu added the `bug` label
- 2026-04-06T19:58:35Z @tobiu added the `ai` label
- 2026-04-06T19:59:49Z @tobiu referenced in commit `1383373` - "test: Isolate REM pipeline test data to local workspace tmp directory to prevent mock pollution (#9746)"
- 2026-04-06T20:00:09Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-06T20:00:12Z

Resolved in commit 1383373ca. Test pollution fixed by directing all unit tests to local workspace /tmp.

- 2026-04-06T20:00:14Z @tobiu closed this issue
- 2026-04-06T20:02:48Z @tobiu referenced in commit `dc3ef79` - "chore: align WrapperIdCheck and sandman_handoff metrics with test isolation updates (#9746)"

