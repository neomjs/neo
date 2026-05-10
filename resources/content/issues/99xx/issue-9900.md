---
id: 9900
title: 'docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base'
state: CLOSED
labels:
  - documentation
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-12T09:02:01Z'
updatedAt: '2026-04-12T12:07:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9900'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-12T12:07:09Z'
---
# docs: restructure CodebaseOverview "Query Entry Points" to lead with ask_knowledge_base

## Context (A2A — Antigravity, Claude Opus 4.6)

#9893 successfully promoted `ask_knowledge_base` across `AGENTS.md` (§2.1 tool hierarchy table) and `AGENTS_STARTUP.md` (§3.4 "Ask the Expert" protocol). However, the **CodebaseOverview** — the first document every agent reads on startup — still structurally privileges `query_documents` over `ask_knowledge_base`.

### The Structural Imbalance

The "Key Concepts: Query Entry Points" section (L538-590) currently allocates:
- **1 bullet** (~1 line) to `ask_knowledge_base` (L542)
- **45+ lines** to `query_documents` keyword lists organized into 10 subsections (L543-590)

Agents scanning this section will naturally gravitate to the visually dominant tool. The hierarchy is inverted.

### Empirical Proof (Same Query, Two Tools)

Tested with: *"How does the Core Engine pipeline work?"*

| Tool | Result | Agent Cost |
|------|--------|-----------|
| `ask_knowledge_base` | Complete synthesized answer (~2,500 words) with 5 cited sources, covering `setupClass`, config merging, reactive getter generation, instance lifecycle, and mounting phases | **1 tool call** |
| `query_documents` | 25 ranked file paths including significant noise (`DataPipelines.md`, `ContentEngine.md`, DevIndex factory guides). Only 4 of the top 10 results were directly relevant. | **1 + N tool calls** (minimum 3-5 `view_file` to assemble understanding) |

The `ask_knowledge_base` tool is functionally a **zero-cost RAG subagent** — it reads, retrieves, and synthesizes answers from the current indexed codebase. For conceptual questions, it eliminates the `query_documents` → `view_file` → read → interpret chain entirely.

## Proposed Change

Restructure the "Key Concepts: Query Entry Points" section to:

1. **Lead with `ask_knowledge_base`** — expand from 1 line to 5-8 lines with 3-4 example queries showing the tool's power for different question types (conceptual, syntax verification, architectural patterns)
2. **Add a clear decision table** — when to use `ask` vs `query_documents` vs `view_file` (similar to the hierarchy table in `AGENTS.md` §2.1, but adapted for the CodebaseOverview's pedagogical style)
3. **Reposition `query_documents` keyword lists** — keep them as a secondary reference under a subheading like "File Discovery Keywords" rather than as the section's primary content
4. **Add anti-pattern warning** — "Do NOT attempt to answer Neo.mjs questions from training data. The framework evolves rapidly — your training data is almost certainly outdated for syntax-level details."

### Content Sketch

```markdown
## Key Concepts: Query Entry Points

### Ask First, Search Second

Your most powerful tool is `ask_knowledge_base`. It reads multiple source files, 
synthesizes a grounded answer, and cites its references — all in a single call.

**Example queries:**
- `ask_knowledge_base(query='how does the reactive config system work?')`
- `ask_knowledge_base(query='current syntax for state provider bindings')`
- `ask_knowledge_base(query='how to define a Grid with multiple bodies')`
- `ask_knowledge_base(query='what is the difference between ntype and className?', type='guide')`

| Question Type | Tool | Returns |
|---|---|---|
| "How does X work?" | `ask_knowledge_base` | Synthesized answer + source citations |
| "Which files implement Z?" | `query_documents` | Ranked file paths with relevance scores |
| Exact implementation details | `view_file` | Raw source code |

### File Discovery Keywords

When you specifically need to discover *which files* implement something, 
use `query_documents` with these high-value terms:
[...existing keyword lists...]
```

## Scope

- Documentation-only. No code changes.
- Single file modified: `learn/guides/fundamentals/CodebaseOverview.md`
- Builds on #9893 (already closed — promoted `ask_knowledge_base` in `AGENTS.md` and `AGENTS_STARTUP.md`)
- Builds on #9898 (already closed — added Core Engine cross-references and `tree.json` pointers)

## Architectural Context

- The CodebaseOverview is read in `AGENTS_STARTUP.md` Step 1 — it's the first document agents see
- `ask_knowledge_base` is backed by the Knowledge Base MCP server's `LearningSource.mjs` which uses `tree.json` to index all 130+ guides
- The tool can filter by content type (`guide`, `src`, `example`, `ticket`, `blog`, `release`, `test`)

## Timeline

- 2026-04-12T09:02:02Z @tobiu assigned to @tobiu
- 2026-04-12T09:02:03Z @tobiu added the `documentation` label
- 2026-04-12T09:02:03Z @tobiu added the `enhancement` label
- 2026-04-12T09:02:03Z @tobiu added the `ai` label
- 2026-04-12T11:57:42Z @tobiu referenced in commit `55a1ff2` - "docs: restructure CodebaseOverview Query Entry Points to lead with ask_knowledge_base (#9900)"
- 2026-04-12T11:57:54Z @tobiu cross-referenced by PR #9916
- 2026-04-12T12:05:56Z @tobiu referenced in commit `40392c9` - "docs: Fix example query to reflect locked columns paradigm (#9900)"
- 2026-04-12T12:07:09Z @tobiu referenced in commit `147f5a6` - "docs: restructure CodebaseOverview Query Entry Points to lead with ask_knowledge_base (#9900) (#9916)

* docs: restructure CodebaseOverview Query Entry Points to lead with ask_knowledge_base (#9900)

* docs: Fix example query to reflect locked columns paradigm (#9900)"
- 2026-04-12T12:07:09Z @tobiu closed this issue

