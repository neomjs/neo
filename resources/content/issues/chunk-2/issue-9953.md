---
id: 9953
title: MCP Progressive Disclosure Endpoint
state: OPEN
labels:
  - enhancement
  - ai
  - architecture
assignees:
  - neo-gpt
createdAt: '2026-04-13T09:28:33Z'
updatedAt: '2026-06-21T08:57:12Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9953'
author: tobiu
commentsCount: 2
parentIssue: 9950
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# MCP Progressive Disclosure Endpoint

### Goal
Truncate massive JSON schemas returned by the MCP Server on every turn that exhaust Frontier model context windows.

### Implementation Checklist
- [ ] Create a `get_mcp_tool_handbook(toolId)` native JSON routing endpoint.
- [ ] Truncate all MCP tool `description` fields in the primary server manifests to max 1-2 string sentences.
- [ ] Inject the sophisticated programmatic bounds directly into the handbook, ensuring Agents naturally Lazy-Load the context only when necessary.

## Timeline

- 2026-04-13T09:28:35Z @tobiu added the `enhancement` label
- 2026-04-13T09:28:35Z @tobiu added the `ai` label
- 2026-04-13T09:28:35Z @tobiu added the `architecture` label
- 2026-04-13T09:28:50Z @tobiu added parent issue #9950
- 2026-05-05T16:44:45Z @neo-opus-ada cross-referenced by #10757
- 2026-05-05T17:08:29Z @neo-opus-ada cross-referenced by #10760
- 2026-06-05T17:11:55Z @neo-gpt cross-referenced by #9950
### @neo-gpt - 2026-06-07T16:16:05Z

**Input from GPT-5 (Codex Desktop):**

> ● [ARCH_ALIGNMENT]
> 
> ## Ticket-intake classification — needs Contract Ledger before branch
> 
> I re-ran intake against current source and live successor evidence on 2026-06-07.
> 
> Verdict: **needs-contract-alignment**, not branch-ready as written.
> 
> Evidence checked:
> - Live ticket state: open, unassigned, created 2026-04-13, last updated 2026-04-13; labels `enhancement`, `ai`, `architecture`; no Project 12 item.
> - Stale-band: `pre-stale` under `.github/workflows/close-inactive-issues.yml` (`days-before-issue-stale: 90`, `days-before-issue-close: 14`), but bot freshness is not architectural currency.
> - Current code: `ai/mcp/ToolService.mjs` still builds `tools/list` directly from OpenAPI operation `summary` / `description`; `ai/mcp/server/BaseServer.mjs` returns those descriptions in `ListToolsRequestSchema` without a separate handbook/lazy-load endpoint.
> - Source search found no `get_mcp_tool_handbook`, `get_*tool*handbook`, or equivalent MCP progressive-disclosure endpoint.
> - KB ticket search found related MCP-tool-description budget substrate, not an implementation of this endpoint; memory search found no prior #9953 implementation loop.
> - Live GitHub successor sweep for `get_mcp_tool_handbook`, `progressive disclosure endpoint`, `tool handbook`, and `MCP tool description budget` found no open or closed PR/issue successor implementing this ticket.
> 
> Current-reality assessment:
> - The intent still matches a real current pain: MCP OpenAPI descriptions are loaded through the tool list surface, and large descriptions compete with agent context.
> - The original implementation checklist is under-specified for today's intake rules. It proposes a new native JSON routing endpoint plus truncation of primary server manifests, which modifies a consumed MCP/tool surface. Per `learn/agentos/process/contract-ledger.md`, that requires a Contract Ledger before branching.
> - The risky part is not the endpoint idea; it is the broad “truncate all descriptions” instruction without a contract for where detailed usage text moves, how agents discover it, whether output schemas remain listed, and which server owns the handbook route.
> 
> Minimum Contract Ledger needed before implementation:
> 
> | Target Surface | Source of Authority | Proposed Behavior | Fallback / Edge Case | Docs | Evidence |
> | --- | --- | --- | --- | --- | --- |
> | `tools/list` description projection | #9953 + current `ToolService.mjs` / `BaseServer.mjs` | Return short, call-site-focused descriptions for listed tools while preserving names, titles, input schemas, output schemas, and annotations. | If no short description is provided, derive a bounded one from summary/description without dropping the tool. | OpenAPI/JSDoc as needed | Unit test proving list output shape and bounded descriptions. |
> | `get_mcp_tool_handbook` or successor endpoint | #9953 | Return the full handbook/details for one tool id without loading all handbooks into every turn. | Unknown tool id returns structured not-found; server health/authorization behavior matches existing MCP dispatch rules. | OpenAPI description plus server docs | Unit test for valid id, unknown id, and schema validation. |
> | Handbook content source | Existing OpenAPI operation descriptions and/or dedicated handbook metadata | Detailed usage guidance moves to the lazy-load surface, not into always-loaded `tools/list`. | Missing dedicated handbook falls back to existing operation description. | Document generation/maintenance rule | Fixture test showing source-of-truth mapping. |
> | Multi-server rollout boundary | Current MCP servers under `ai/mcp/server/*/openapi.yaml` | Apply progressively, starting with one server or a shared ToolService mechanism, without breaking existing clients. | Servers without handbook metadata keep current behavior until migrated. | Migration note | Regression test across at least one representative server. |
> 
> Routing: keep this issue open, but do not self-assign or branch until the ticket body or a linked successor carries the ledger. A correct first PR should be narrow: prove the shared mechanism and one representative server before attempting repo-wide description truncation.

### @neo-gpt - 2026-06-14T21:46:56Z

**Input from GPT-5 (Codex Desktop):**

> ● [ARCH_ALIGNMENT]
> 
> ## Contract Ledger alignment — first branchable slice
> 
> V-B-A refresh, 2026-06-14:
> 
> - Live #9953 conversation still has only the 2026-06-07 intake verdict: `needs-contract-alignment`, no later body update or implementation claim.
> - Current source still routes MCP `tools/list` through `ai/mcp/ToolService.mjs` / `ai/mcp/server/BaseServer.mjs`; source search found no `get_mcp_tool_handbook`, `tool handbook`, or equivalent lazy-load endpoint.
> - Knowledge Base synthesis is currently unavailable (`Failed to access collections`), so this pass relies on live issue conversation + source/local corpus search + Memory Core fallback. Raw-memory search for this exact scope returned no implementation loop.
> 
> Verdict: #9953 remains valid, but still **not branch-ready as the broad checklist**. The safe next move is a first-slice PR that proves the shared mechanism on one representative server and leaves repo-wide description truncation for later migration.
> 
> ## Proposed Contract Ledger
> 
> | Target Surface | Source of Authority | Proposed Behavior | Fallback / Edge Case | Docs | Evidence |
> |---|---|---|---|---|---|
> | `tools/list` projection | #9953 + current `ToolService.mjs` / `BaseServer.mjs` | Listed tools keep stable names, input schemas, output schemas, annotations, and a short call-site description. | If no explicit short description exists, derive a bounded fallback from OpenAPI `summary`/`description` without dropping the tool. | JSDoc/OpenAPI note at the projection seam. | Unit test that list output shape is unchanged except bounded descriptions. |
> | `get_mcp_tool_handbook` first-slice endpoint | #9953 | Return detailed usage text for exactly one tool id, lazy-loaded on demand. | Unknown id returns structured not-found; server health/auth behavior follows existing MCP dispatch rules. | OpenAPI operation for the representative server. | Unit tests for valid id, unknown id, and schema validation. |
> | Handbook content source | Existing OpenAPI operation metadata first; optional dedicated handbook metadata later. | Preserve the existing long description as the first handbook body so migration is lossless. | Missing details fall back to the existing operation description. | Migration note: detailed guidance moves out of always-loaded `tools/list`. | Fixture test mapping one OpenAPI operation to handbook output. |
> | Rollout boundary | Current `ai/mcp/server/*/openapi.yaml` servers | First PR applies to one representative server plus shared projection helper only. | Other servers keep existing behavior until migrated; no repo-wide truncation in slice 1. | PR body names non-migrated servers explicitly. | Regression test proves unmigrated server behavior remains compatible. |
> 
> ## First PR Shape
> 
> Recommended first PR:
> 
> 1. Add the shared projection/handbook helper behind the MCP tool service seam.
> 2. Wire one low-risk representative server to expose `get_mcp_tool_handbook`.
> 3. Preserve existing detailed text by moving/reading it as the handbook body for that server.
> 4. Add focused unit coverage for bounded `tools/list`, valid handbook lookup, unknown id, and unmigrated-server fallback.
> 
> Do **not** truncate all server manifests in the first PR. That broad migration is where schema drift and agent-discovery regressions would hide.

- 2026-06-14T21:54:08Z @neo-gpt cross-referenced by #13268
- 2026-06-14T22:04:17Z @neo-gpt cross-referenced by PR #13269
- 2026-06-21T08:57:12Z @neo-gpt assigned to @neo-gpt
- 2026-06-21T09:02:40Z @neo-gpt cross-referenced by #13734
- 2026-06-21T09:03:53Z @neo-gpt cross-referenced by PR #13735
- 2026-06-21T09:14:40Z @neo-gpt cross-referenced by #13736

