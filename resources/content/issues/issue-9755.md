---
id: 9755
title: 'Test: Correct embeddingModel to qwen3-embedding in SessionSummarization'
state: CLOSED
labels:
  - ai
  - testing
assignees:
  - tobiu
createdAt: '2026-04-07T13:11:14Z'
updatedAt: '2026-04-07T13:11:50Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9755'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T13:11:50Z'
---
# Test: Correct embeddingModel to qwen3-embedding in SessionSummarization

### Description
The `SessionSummarization.spec.mjs` Playwright test incorrectly overrides `SDK.Memory_Config.data.ollama.embeddingModel` to use `gemma4`. Since `gemma4` is the core inferencer (LLM) and not an embedding model, this is an architectural drift compared to the local native config (`qwen3-embedding`).
Tracking the fix to correct the test configuration.

## Timeline

- 2026-04-07T13:11:20Z @tobiu added the `ai` label
- 2026-04-07T13:11:20Z @tobiu added the `testing` label
- 2026-04-07T13:11:47Z @tobiu referenced in commit `f3dc18c` - "test: fix embedding mock to use native qwen3-embedding config (#9755)"
- 2026-04-07T13:11:48Z @tobiu assigned to @tobiu
- 2026-04-07T13:11:50Z @tobiu closed this issue

