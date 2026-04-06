---
id: 9724
title: Stabilize GraphService Initialization Race conditions and Memory bounds
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-05T21:03:54Z'
updatedAt: '2026-04-06T18:11:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9724'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-06T18:11:43Z'
---
# Stabilize GraphService Initialization Race conditions and Memory bounds

Resolves Foreign Key errors hitting `GraphService.initAsync` due to parallel Node `GraphService` script evaluations competing for `storage` resources inside unit test runners.

Also fixes LRU matrix count assertion bugs inside `GraphService.spec.mjs` test by establishing safe `.db.clear()` runtime isolations to guarantee that the RAM footprint bounds remain accurately tested without data leakage.

## Timeline

- 2026-04-05T21:03:55Z @tobiu added the `bug` label
- 2026-04-05T21:03:55Z @tobiu added the `ai` label
- 2026-04-05T21:09:38Z @tobiu assigned to @tobiu
- 2026-04-05T21:52:12Z @tobiu referenced in commit `8a4221a` - "fix(GraphService): Eliminate async parallel initialization conditions and flush strict db scopes (#9724)"
- 2026-04-05T21:52:12Z @tobiu referenced in commit `150daee` - "feat(MemoryCore): Add Ollama process lifecycle management and cleanup (#9724)"
- 2026-04-06T18:11:43Z @tobiu closed this issue

