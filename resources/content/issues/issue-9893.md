---
id: 9893
title: 'feat: Promote ask_knowledge_base as the primary Anti-Hallucination tool across agent protocols'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-11T19:27:36Z'
updatedAt: '2026-04-11T20:10:47Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9893'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-11T20:04:12Z'
---
# feat: Promote ask_knowledge_base as the primary Anti-Hallucination tool across agent protocols

## Context

The `ask_knowledge_base` MCP tool is the single most powerful Anti-Hallucination primitive available to agents — it performs semantic search across the entire indexed codebase and uses an LLM to synthesize a grounded answer with cited references. It is functionally a **zero-cost subagent** that even local SLMs (e.g., Gemma4-31B via MLX) can invoke to get frontier-model-quality answers from the knowledge base.

Despite this, the tool is:
1. **Under-documented** in its own OpenAPI spec (12 lines vs. 70+ lines for `query_documents`)
2. **Absent from all agent protocol docs** — zero references in `AGENTS.md`, `AGENTS_STARTUP.md`, or any skill files
3. **Not positioned in the tool discovery hierarchy** — agents default to `query_documents` → `view_file` chains, wasting context window on file reads when a single `ask_knowledge_base` call would suffice

This leads to a systemic failure mode: agents (especially smaller models) attempt to answer Neo.mjs questions from general training data or by reading multiple files, when they could invoke `ask_knowledge_base` once and get a grounded, cited answer.

## A2A Context (Fat Ticket)

### Root Cause

The tool was added after the agent protocols were written. Neither `AGENTS.md` nor `AGENTS_STARTUP.md` mention it. The `query_documents` tool has extensive "How to Interpret Results" and "Query Strategies" sections in its OpenAPI description — `ask_knowledge_base` has none. Agents naturally gravitate toward the better-documented tool.

### Proposed Changes

#### 1. OpenAPI Tool Description Enhancement (`openapi.yaml`, lines 286-298)

Expand the `ask_knowledge_base` description to match or exceed the `query_documents` description quality. Key additions:
- **Priority positioning**: "This should be your FIRST tool for conceptual questions about Neo.mjs. Use `query_documents` only when you need to discover file paths."
- **Capability framing**: "This tool acts as a subagent — it reads and synthesizes multiple source files for you, eliminating the need to read files manually."
- **Model-agnostic value**: "Even lightweight local models can leverage this tool to access frontier-quality framework knowledge."
- **Examples**: Include 3-4 example queries with expected output shapes
- **Anti-pattern warning**: "Do NOT attempt to answer Neo.mjs questions from training data. Always ask the knowledge base first."

#### 2. AGENTS.md — New Section or Integration into §2 (Anti-Hallucination Policy)

The Anti-Hallucination Policy (§2) currently says:
> "If you do not know something, you must find the answer using the query tool."

This should be updated to explicitly reference `ask_knowledge_base` as the **primary** tool, with `query_documents` as the secondary file-discovery tool. Proposed tool hierarchy:

| Need | Tool | Returns |
|------|------|---------|
| Conceptual understanding | `ask_knowledge_base` | Synthesized answer + citations |
| File discovery / path lookup | `query_documents` | Ranked file paths with scores |
| Implementation details | `view_file` | Raw source code |
| Past decisions / context | `query_raw_memories` | Agent episodic memory |

#### 3. AGENTS_STARTUP.md — Session Initialization

If `AGENTS_STARTUP.md` includes a session boot sequence, `ask_knowledge_base` should be listed as an available tool for rapid context acquisition during the warm-up phase.

### Files to Modify

| File | Change |
|------|--------|
| `ai/mcp/server/knowledge-base/openapi.yaml` | Expand `ask_knowledge_base` description (lines 286-298) with priority positioning, examples, and anti-patterns |
| `.agent/AGENTS.md` | Update Anti-Hallucination Policy (§2) to reference `ask_knowledge_base` explicitly with tool hierarchy table |
| `ai/AGENTS_STARTUP.md` | Add `ask_knowledge_base` to session initialization toolkit (if applicable) |

### Avoided Pitfalls

- Do NOT remove or deprecate `query_documents` — it serves a different purpose (file discovery). The goal is to **position** `ask_knowledge_base` as the first tool agents reach for, not to replace the existing toolchain.
- The OpenAPI description must remain parseable by all MCP client implementations. Avoid embedding complex markdown that might break rendering in Claude Code, Gemini CLI, or Antigravity.

## Verification Plan

1. Grep verification: `ask_knowledge_base` appears in `AGENTS.md` §2 and `openapi.yaml` with expanded description
2. Functional test: Ask a new agent "how does the config system work in Neo.mjs?" and verify it reaches for `ask_knowledge_base` before `query_documents` or `view_file`

## Timeline

- 2026-04-11T19:27:38Z @tobiu added the `documentation` label
- 2026-04-11T19:27:39Z @tobiu added the `enhancement` label
- 2026-04-11T19:27:39Z @tobiu added the `ai` label
- 2026-04-11T19:27:43Z @tobiu assigned to @tobiu
- 2026-04-11T19:29:49Z @tobiu cross-referenced by #9892
- 2026-04-11T19:55:45Z @tobiu referenced in commit `b4007bd` - "docs: Promote ask_knowledge_base as primary Anti-Hallucination tool (#9893)"
- 2026-04-11T19:56:07Z @tobiu cross-referenced by PR #9894
- 2026-04-11T19:59:53Z @tobiu referenced in commit `fc9b59c` - "docs: Promote ask_knowledge_base as primary Anti-Hallucination tool (#9893)"
- 2026-04-11T20:04:11Z @tobiu referenced in commit `c6452ce` - "docs: Promote ask_knowledge_base as primary Anti-Hallucination tool (#9893) (#9894)"
- 2026-04-11T20:04:12Z @tobiu closed this issue

