---
id: 9658
title: Enhance Memory-Core for explicit Gemma4 offline session summarization
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-03T12:31:04Z'
updatedAt: '2026-04-03T13:48:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9658'
author: tobiu
commentsCount: 1
parentIssue: 9638
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-03T13:20:09Z'
---
# Enhance Memory-Core for explicit Gemma4 offline session summarization

The `Memory-Core` currently enforces Google Gemini logic internally for compiling summarization meta-blocks and indexing cognitive drift. 

In pursuit of complete offline AI Swarm viability, this requirement should be configurable. We need to optionally route session summarizations through local Ollama models (such as `gemma4`), bypassing the Gemini upstream requirement where the offline topology proves capable enough.

### Acceptance Criteria
- Extend `config.mjs` in Memory Core with variables for local `modelProvider` and `ollama` endpoints.
- Introduce polymorphic provider support into `SessionService.mjs` so it automatically maps prompt configurations through the correct REST pipeline (Ollama APIs vs Gemini SDK).
- Draft a targeted Playwright suite mimicking `five turns` of dummy agent behavior, proving `gemma4` can reliably intercept the summarization chain.
- The unit suite must gracefully ignore/skip execution if `gemma4` or the `ollama` daemon is unreachable.

## Timeline

- 2026-04-03T12:31:05Z @tobiu added the `enhancement` label
- 2026-04-03T12:31:05Z @tobiu added the `ai` label
- 2026-04-03T13:19:52Z @tobiu referenced in commit `9aaf7ba` - "feat: Extend SessionService generation model to support Ollama and Gemma 4 (#9658)"
### @tobiu - 2026-04-03T13:20:08Z

Pushed in 9aaf7ba90. Playwright unit tests succeed successfully connecting to the local Ollama daemon for memory-core summarization.

- 2026-04-03T13:20:09Z @tobiu closed this issue
- 2026-04-03T13:34:47Z @tobiu referenced in commit `67d52ac` - "test: Add dummy memory mock logic to offline summarization tests (#9658)"
- 2026-04-03T13:48:25Z @tobiu assigned to @tobiu
- 2026-04-03T13:48:45Z @tobiu added parent issue #9638

