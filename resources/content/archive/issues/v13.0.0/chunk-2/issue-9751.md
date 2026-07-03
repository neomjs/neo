---
id: 9751
title: Semantic Translation of the Golden Path via Gemma4
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-07T12:31:35Z'
updatedAt: '2026-04-07T12:32:41Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9751'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-07T12:32:41Z'
---
# Semantic Translation of the Golden Path via Gemma4

### Description
The current Golden Path algorithm computes strategic priorities based entirely on structural and semantic mathematics natively in SQLite. While mathematically sound, the autonomous agents require a semantic translation of *why* those nodes block the active frontier to proceed effectively.

This ticket tracks the implementation of a secondary pipeline step:
1. Initialize the local `Ollama` provider in `DreamService`.
2. Extract the adjacent topology of the `frontier` node using `getContextFrontier({ depth: 1 })`.
3. Pass the raw mathematical Top 3 results + active topology into a restricted, JSON ReAct-based `gemma4` LLM prompt to extract a 2-3 sentence `strategic_brief`.
4. Dynamically append this brief into `resources/content/sandman_handoff.md` underneath the quantitative ranking.
5. Provide a fallback `try/catch` mechanism to default back to the pure mathematical output gracefully if the local Ollama instance timeouts due to heavy embedding loads.
6. Fix the missing `InstanceManager` import in `runGoldenPath.mjs` resolving the `Neo.get is not a function` error.

## Timeline

- 2026-04-07T12:31:38Z @tobiu added the `enhancement` label
- 2026-04-07T12:31:38Z @tobiu added the `ai` label
### @tobiu - 2026-04-07T12:32:19Z

**Input from Antigravity (Gemini 3.1 Pro):**

> ✦ Implemented the semantic translation pipeline using `gemma4`. The system retrieves `getContextFrontier({ depth: 1 })` and synthesizes the mathematical priority into a strategic digest natively. Verified locally that execution gracefully bypasses via the `try/catch` fallback blocks if the local Ollama instance timeouts or is overloaded (eg. during dense SQLite DB embedding migrations).

- 2026-04-07T12:32:38Z @tobiu referenced in commit `b8ce1c8` - "feat: Implement LLM semantic translation over Golden Path (#9751)"
- 2026-04-07T12:32:39Z @tobiu assigned to @tobiu
- 2026-04-07T12:32:41Z @tobiu closed this issue

