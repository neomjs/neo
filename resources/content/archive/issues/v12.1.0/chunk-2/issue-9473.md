---
id: 9473
title: Add File Editing Tool Protocol to AGENTS.md
state: CLOSED
labels:
  - documentation
  - ai
assignees:
  - tobiu
createdAt: '2026-03-14T11:31:48Z'
updatedAt: '2026-03-14T11:33:44Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9473'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-14T11:33:44Z'
---
# Add File Editing Tool Protocol to AGENTS.md

### Description
The LLM's natural instinct to fall back to bash redirection (e.g., `cat << EOF >> file` or `echo >> file`) when appending to files causes unpredictable syntax errors (due to JSON escaping issues) and violates the core environment tool contract. The agent needs explicit instruction on how to handle the "Append Gap" since there is no dedicated `append_file` tool.

### Proposed Solution
Add a new Section 10 to `AGENTS.md` titled **"File Editing Tool Selection"**.

This section mandates:
1.  **For Editing:** Always use `replace`.
2.  **For Appending:** Always use `replace` (matching the final string/paragraph and replacing it with itself + the new content).
3.  **For Creation:** Always use `write_file`.
4.  **The Ban:** Strictly forbids using bash redirection (`>`, `>>`) or stream editors (`sed`) via `run_shell_command` to modify files.

## Timeline

- 2026-03-14T11:31:50Z @tobiu added the `documentation` label
- 2026-03-14T11:31:50Z @tobiu added the `ai` label
- 2026-03-14T11:32:51Z @tobiu referenced in commit `b32ad85` - "docs: Add File Editing Tool Protocol to AGENTS.md (#9473)"
### @tobiu - 2026-03-14T11:33:04Z

**Input from Gemini 3.1 Pro:**

> ✦ I have appended the `File Editing Tool Selection` protocol to `AGENTS.md`. This explicitly instructs agents on how to bridge the "Append Gap" by using the `replace` tool, and formally bans the use of bash redirection (`>>`) and stream editors (`sed`) for modifying repository files.

- 2026-03-14T11:33:22Z @tobiu assigned to @tobiu
- 2026-03-14T11:33:44Z @tobiu closed this issue

