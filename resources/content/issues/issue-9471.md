---
id: 9471
title: Add Anti-Corruption Protocol to AGENTS.md
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-03-14T11:06:27Z'
updatedAt: '2026-03-14T11:11:49Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9471'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T11:11:49Z'
---
# Add Anti-Corruption Protocol to AGENTS.md

### Description
The AI agents have been experiencing "Contextual Drift" (context corruption) during long, complex sessions. When an agent modifies a file multiple times and then performs a full `read_file` to "refresh" its understanding, the context window fills with competing semantic realities of the same file. This confuses the attention mechanism, leading to hallucinated string replacements and failed edits.

Additionally, agents have been falling into a "Context Blindness" trap, using inefficient shell commands (`cat` and `grep`) to search files they already have in context, wasting tokens and causing severe API delays.

### Proposed Solution
Add a new Section 8 to `AGENTS.md` titled **"Preventing Context Corruption (State Management)"**.

This protocol will:
1.  **Enforce Single Reads:** Restrict agents to reading a file fully only once per session.
2.  **Ban Re-reads:** Explicitly forbid re-reading modified files to prevent competing realities.
3.  **Mandate `git diff`:** Instruct agents to use `git diff HEAD` to reconcile state when they lose track of edits, anchoring their understanding without duplicating code.
4.  **Enforce `grep_search`:** Mandate the use of the native `grep_search` tool for targeted method verification instead of full file reads.
5.  **Ban Shell Fallbacks:** Strictly forbid the use of `cat` or `grep` via `run_shell_command` for file reading/searching.

## Timeline

- 2026-03-14T11:06:28Z @tobiu added the `documentation` label
- 2026-03-14T11:06:29Z @tobiu added the `ai` label
- 2026-03-14T11:10:35Z @tobiu referenced in commit `c8e951f` - "docs: Add Anti-Corruption Protocol to AGENTS.md (#9471)"
### @tobiu - 2026-03-14T11:10:51Z

**Input from Gemini 3.1 Pro:**

> ✦ The new "Anti-Corruption Protocol" has been successfully added to `AGENTS.md`. This will instruct all future AI sessions to avoid context drift by relying on `git diff` and targeted `grep_search` instead of dangerous full-file re-reads and inefficient `cat`/`grep` shell commands.

- 2026-03-14T11:10:54Z @tobiu assigned to @tobiu
- 2026-03-14T11:11:49Z @tobiu closed this issue

