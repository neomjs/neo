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
updatedAt: '2026-03-15T18:37:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9471'
author: tobiu
commentsCount: 3
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
### @raye-deng - 2026-03-15T18:20:12Z

This is a really well-written analysis of a problem I've been running into as well. The 'competing semantic realities' issue is exactly what happens — an agent reads a file, modifies it, then re-reads it, and now there are two versions of the truth in the context window. The attention mechanism can't reliably distinguish which one is current.

One additional pattern that's helped us: always anchor edits via `git diff` and never rely on the agent's memory of what a file 'should' contain. We enforce this in Open Code Review's agent rules — the agent must call `git diff HEAD -- <file>` before any edit to reconcile state, similar to your Option 4.

Regarding hallucinated replacements specifically — this is the same root cause as hallucinated package names in generated code. The model generates plausible-looking output that passes surface-level checks but doesn't correspond to reality. Traditional linters can't catch this because syntactically the code is valid. We've had to build dedicated hallucination detection for dependencies and API calls in our code review tool.

The 'ban re-reads' and 'enforce grep_search' proposals are practical. We'd also suggest adding a max-context-refresh budget per session to prevent the drift compounding.

### @tobiu - 2026-03-15T18:37:34Z

@raye-deng Thanks for your input! The `git diff` idea sounds good for edits. I am still mostly using Gemini CLI with the 3.1 pro model. I did notice that the CLI instructions recently changed, and not in a good way. Starting with

```
CRITICAL INSTRUCTION 1: Use specific tools.
```

The intent is good, but it seems to just confuse models. The changes of this ticket definitely need more refinements: now Gemini is frequently using the `Search_Text` tool inside known files.

What helped me the most to counter hallucinations is this one:
https://github.com/neomjs/neo/blob/dev/learn/guides/mcp/NeuralLink.md

Best regards,
Tobi


