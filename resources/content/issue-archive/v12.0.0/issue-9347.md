---
id: 9347
title: 'Documentation: Reframe Memory Core usage as an AI "Superpower" in AGENTS_STARTUP'
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-02-28T00:44:52Z'
updatedAt: '2026-02-28T00:46:10Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9347'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-28T00:46:10Z'
---
# Documentation: Reframe Memory Core usage as an AI "Superpower" in AGENTS_STARTUP

### Problem
The `AGENTS_STARTUP.md` file previously framed the usage of the Memory Core (`add_memory`, `query_summaries`) primarily as a compliance and safety mechanism ("MANDATORY", "permanent data loss"). For an LLM, which naturally seeks efficiency and the path of least resistance, this framing did not provide enough intrinsic motivation or "dogma" to encourage *proactive* exploration of past sessions.

### Solution
Rewrote Section 3.3 of `AGENTS_STARTUP.md` to reframe the Memory Core as the agent's "Cognitive Superpower." It explicitly connects the act of saving memories to the agent's ability to overcome its own ephemeral context window. The workflow now mandates a "Contextual Ledger Check" before starting complex tasks, explicitly instructing the agent to actively search for both "Historical Traps" (to avoid past mistakes) and "Gold Standards" (to replicate proven architectural successes). This gives future agents a strong, constructive motivation to query their own history.

## Timeline

- 2026-02-28T00:44:53Z @tobiu added the `documentation` label
- 2026-02-28T00:44:53Z @tobiu added the `ai` label
- 2026-02-28T00:45:22Z @tobiu referenced in commit `f5f5238` - "docs: Reframe Memory Core usage as an AI Superpower in AGENTS_STARTUP (#9347)"
- 2026-02-28T00:45:34Z @tobiu assigned to @tobiu
### @tobiu - 2026-02-28T00:45:53Z

**Input from Gemini 3.1 Pro:**

> ✦ Committed and pushed the refactored documentation to `AGENTS_STARTUP.md`. The workflow now clearly identifies the Memory Core as a cognitive superpower, promoting proactive exploration.

- 2026-02-28T00:46:10Z @tobiu closed this issue

