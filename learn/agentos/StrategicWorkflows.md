# Strategic Workflows

The dangerous regression fix is the tidy one: find the failing line, patch the
symptom, and accidentally erase the reason that line existed. Neo's Agent OS has
enough memory substrate to avoid that trap. A maintainer can combine Git history,
Knowledge Base retrieval, Memory Core recall, and Native Edge Graph topology into
one evidence loop before touching the code.

For a human maintainer, that means an agent's fix can be audited as a chain of
evidence instead of a confident guess. You can see what changed, which ticket or
discussion motivated it, what prior sessions learned, and which structural
neighbors were checked.

For you, the model reading this guide, the same regression is no longer a
cold-start puzzle. You can ask the organism for the written plan, the unwritten
intent, and the graph around the affected node before you edit. That is how a
session moves from helpful patching to situated maintenance.

## Regression Bug Analysis

Use this workflow when behavior used to work and now fails. The goal is not to
revert the past; it is to preserve the valid intent from the past while fixing
the present failure.

### 1. Isolate The Regression

Start with the observable breakage:

- What changed for the user or operator?
- Which file, class, command, guide, or workflow now behaves incorrectly?
- Is there a focused test, render check, CLI command, or live probe that can
  falsify the symptom?

Do not explain the cause yet. First define the failure mode well enough that a
tool result can prove or disprove it.

### 2. Find The Breaking Change

Use Git for the mechanical history:

```bash
git log --oneline -- <path>
git blame <path>
```

The commit message often gives you the first ticket, PR, or discussion anchor.
That anchor is not the whole truth; it is the doorway into the rest of the
evidence.

### 3. Recover The Written Plan

Inside an active MCP session, use the Knowledge Base and GitHub Workflow tools
rather than retired shell scripts:

```js
ask_knowledge_base({
    query: "ticket #<ticket_number> original plan and affected files",
    type : "ticket"
})

get_local_issue_by_id({
    issue_number: "<ticket_number>"
})
```

`ask_knowledge_base` is the default starting point for repository knowledge: it
returns a synthesized answer plus cited source references. `get_local_issue_by_id`
is useful when the synced GitHub content already contains the issue; if the local
index is stale, refresh it or read live GitHub state before relying on it.

### 4. Recover The Unwritten Intent

The ticket describes what was planned. Memory Core captures the discussions,
review reversals, operator constraints, and failed alternatives that shaped the
implementation.

```js
query_summaries({
    query: "context for ticket #<ticket_number>"
})

query_raw_memories({
    query   : "<key phrase from the original discussion>",
    nResults: 5
})
```

Use `query_summaries` to zoom out across sessions. Use `query_raw_memories` when
you need the exact decision trail, error text, or review context.

### 5. Check Structural Neighbors

When the regression crosses issue, class, guide, test, or decision boundaries,
ask the Native Edge Graph for topology instead of relying on nearest-text recall:

```js
query_hybrid_graph({
    nodeId  : "issue-<ticket_number>",
    maxDepth: 2
})
```

Issue nodes use the canonical `issue-N` graph id after GitHub content has been
ingested. The graph topology is not a replacement for source reads; it tells you
which neighboring nodes deserve inspection before you edit.

### 6. Synthesize The Fix

Before implementation, write down the three-part synthesis:

- **What changed?** Git history and the breaking commit.
- **What was planned?** Ticket, PR, or discussion evidence.
- **What was intended?** Memory Core and graph context.

Only then choose the patch. A correct fix should satisfy the new failing case
without reintroducing the old failure mode that the original change prevented.

### 7. Preserve The Handoff

When the turn ends, save the reasoning and the result:

```js
add_memory({
    prompt  : "<operator request or task summary>",
    thought : "<evidence chain and decision>",
    response: "<final user-facing result>"
})
```

That final memory is not ceremony. It is the substrate that lets the next
maintainer avoid repeating the same reconstruction.

## Shell Fallback Outside An MCP Session

For standalone scripts, CI diagnostics, or a local shell without first-class MCP
tool bindings, use the repository MCP client. These are the current script names
in `package.json`; the old direct query scripts are retired.

```bash
npm run ai:mcp-client -- --server knowledge-base --call-tool ask_knowledge_base --args '{"query":"ticket #<ticket_number> original plan","type":"ticket"}'

npm run ai:sync-github-workflow
npm run ai:mcp-client -- --server github-workflow --call-tool get_local_issue_by_id --args '{"issue_number":"<ticket_number>"}'

npm run ai:mcp-client -- --server memory-core --call-tool query_raw_memories --args '{"query":"context for ticket #<ticket_number>","nResults":5}'

npm run ai:mcp-client -- --server memory-core --call-tool query_hybrid_graph --args '{"nodeId":"issue-<ticket_number>","maxDepth":2}'
```

Use shell fallback only when tool bindings are unavailable. In an agent turn,
direct MCP calls are clearer, typed, and easier to cite in a PR body.

## Related Guides

- [Memory Core](./MemoryCore.md) - Episodic memory, summaries, mailbox state, and graph storage.
- [Knowledge Base](./KnowledgeBase.md) - Semantic repository knowledge.
- [Dream Pipeline & Golden Path](./DreamPipeline.md) - How memory becomes forecast.
- [Swarm Intelligence](./SwarmIntelligence.md) - Peer-team coordination and lane ownership.
