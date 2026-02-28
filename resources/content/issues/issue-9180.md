---
id: 9180
title: Promote ask_knowledge_base as RAG Sub-Agent in AGENTS_STARTUP.md
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-02-16T02:42:14Z'
updatedAt: '2026-02-16T02:45:02Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9180'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-02-16T02:45:02Z'
---
# Promote ask_knowledge_base as RAG Sub-Agent in AGENTS_STARTUP.md

We need to update `AGENTS_STARTUP.md` to explicitly promote the `ask_knowledge_base` tool as a **RAG Sub-Agent**.

**Problem:**
Agents (including Gemini) often rely on outdated training data for framework-specific syntax (e.g., State Provider bindings, Config system), leading to "hallucinated" legacy code. They underestimate the power of `ask_knowledge_base`, viewing it as a simple search rather than a grounded expert.

**Solution:**
Refactor `AGENTS_STARTUP.md` to include a new **"Ask the Expert" Protocol**.

1.  **Rebrand the Tool:** Explicitly define `ask_knowledge_base` as an "Embedded RAG Sub-Agent" that has read-access to the current repository state.
2.  **Mandate Usage for Syntax:** Enforce a rule that agents **MUST** use this tool when generating code for core framework features (Bindings, Configs, Workers, VDOM) to verify current syntax.
3.  **Explain the "Why":** Highlight that this tool performs a "Read-Eval-Generate" loop: it retrieves relevant files, reads their full content, and synthesizes an answer based *only* on the current codebase, making it the single source of truth for syntax.
4.  **Provide Examples:** Show concrete queries like:
    *   `ask_knowledge_base(query='current syntax for state provider bindings')`
    *   `ask_knowledge_base(query='how to implement a reactive config')`

This will shift agent behavior from "guessing based on training" to "verifying against the repo".

## Timeline

- 2026-02-16T02:42:15Z @tobiu added the `documentation` label
- 2026-02-16T02:42:15Z @tobiu added the `enhancement` label
- 2026-02-16T02:42:15Z @tobiu added the `ai` label
### @tobiu - 2026-02-16T02:44:44Z

**Input from Gemini 3 Pro:**

> ✦ I have updated `AGENTS_STARTUP.md` to include the **"Ask the Expert" Protocol**.
> 
> This new section (3.4) explicitly mandates the use of `ask_knowledge_base` as a RAG Sub-Agent for verifying syntax before writing code, specifically targeting "hallucination hazards" like outdated binding syntax.
> 
> The documentation now clearly defines the tool's role as the single source of truth for framework patterns.

- 2026-02-16T02:44:50Z @tobiu assigned to @tobiu
- 2026-02-16T02:45:03Z @tobiu closed this issue
- 2026-02-16T02:45:24Z @tobiu referenced in commit `6f9a2e0` - "docs: Add 'Ask the Expert' Protocol to AGENTS_STARTUP.md (#9180)"

