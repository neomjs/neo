# Multi-Tenant Migration Guide

This document is the **design source of truth** for how the Neo.mjs Memory Core handles data written before multi-tenancy existed, how tenant-aware reads interact with that legacy data, and how operators migrate installations toward the post-tenant substrate without downtime or retroactive tagging.

It is the product of cross-family design alignment during session `cff20948-2dbb-4ac4-99e2-df2ebe967a4b` (Claude Opus 4.7, Claude Code) and `1c5933cc-a2d0-4296-ae3f-f4e815d385a2` (Gemini 3.1 Pro, Antigravity), resolving [#10017 Migration & Backward Compatibility for Multi-Tenant Schema](../../../resources/content/issues/issue-10017.md) under the updated prescription adopted at intake-reshape time.

Consumers:
- **[#10010 Memory Core: Team vs Private Context Retrieval Flag](../../../resources/content/issues/issue-10010.md)** — the retrieval-side `memorySharing` flag implementation references the enum + semantics pinned below.
- **[#10011 Native Edge Graph (SQLite): Row-Level Security & Tenant Isolation](../../../resources/content/issues/issue-10011.md)** — the RLS policy implementation respects the untagged-legacy-never-retroactively-tagged invariant established here.
- **Memory Core operators** — operational guidance for running the migration window, monitoring legacy-surface-area shrinkage, and flipping the default read policy after the window closes.

## The Core Decision: Lazy-Tag-on-Read, Not Back-Fill

The original `#10017` prescription (authored 2026-04-14) was a back-fill script that would assign `userId: 'default'` to every untagged ChromaDB row. That prescription was architecturally reasonable when the Memory Core substrate was Chroma-metadata-only.

After `#10144` (AgentIdentity graph nodes), `#10145` (OAuth + stdio identity), and `#10146` (cross-tenant permission edges), the substrate changed fundamentally. Identity is now a first-class graph node with `AUTHORED_BY` / `OWNED_BY` / `CAN_READ_*` edges, not scalar metadata. In this post-graph-first world, **back-fill is the wrong migration primitive** for four concrete reasons:

1. **Locks a default-tenant anchor into historical data permanently.** Future multi-user deployments can no longer distinguish "genuinely untagged legacy" from "deliberately default-tenant-assigned at migration time."
2. **Non-idempotent under concurrent writes.** A back-fill batch racing with live `#10145`-wrapped writes produces interleaved state where some batches carry the default tag while live writes carry real identities.
3. **Destroys pre-tenant-aware-era provenance.** The semantic truth of untagged rows is "written before the substrate became tenant-aware." Back-filling erases that truth for operator query convenience that lazy-tag-on-read provides without the erasure.
4. **Doesn't scale to real multi-user deployments.** Fast on the current ~10k memories + ~800 sessions, but production-shape tenant data is orders of magnitude larger.

The adopted prescription is **lazy-tag-on-read**: untagged legacy rows stay untagged forever. Reads that include legacy data explicitly opt into `memorySharing: 'legacy'` semantics. Everything else stays strictly tenant-scoped.

## The Five-Point Plan

### 1. Write-side invariant tightening

All write paths through the Memory Core (`MemoryService.addMemory`, `SessionService` ingestion, `MailboxService.addMessage`) MUST require a bound agent identity via `RequestContextService.getAgentIdentityNodeId()`. Writes that reach these paths without a bound identity context MUST throw loudly rather than degrade silently.

This invariant is already codified in `MailboxService.addMessage` (`ai/services/memory-core/MailboxService.mjs` line ~89-92):

```js
const sentBy = RequestContextService.getAgentIdentityNodeId();
if (!sentBy) {
    throw new Error("Cannot send message: no agent identity context bound. Ensure StdioIdentityResolver or OIDC transport is active.");
}
```

`#10017`'s PR adds regression spec coverage that pins this invariant. If a future refactor drops the identity check, the spec fails loudly at test time rather than silently shipping unbound writes into production SQLite.

### 2. Read-side `memorySharing` flag semantics

The `memorySharing` enum — implementation lives in [#10010](../../../resources/content/issues/issue-10010.md), design pinned here — interacts directly with the SQLite Row-Level Security (RLS) enforcement mechanism (implemented in `#10011`):

| Value | Semantics (SQLite RLS Enforcement) | Intended Use |
|---|---|---|
| `'private'` | Strict tenant isolation. The RLS filter clause strictly requires `user_id = ?`. Untagged legacy rows are excluded natively at the SQLite query level. | Default post-migration-window. Default for multi-user production deployments. |
| `'team'` | Intra-tenant sharing. RLS bypasses strict isolation if `json_extract(data, '$.properties.visibility') = 'team'`. Untagged legacy rows are excluded. | Explicit opt-in for teams that share context across peers within the same tenant. |
| `'legacy'` | Compatibility bucket. The RLS filter clause allows `user_id IS NULL`. Reads return untagged rows AND rows matching the caller's bound tenant. | **Default during migration window.** Enables solo-dev and pre-#10144 data continuity without manual intervention. |

**Default value evolution**:

- **During migration window** (while untagged legacy count is non-trivial relative to tagged count): default is `'legacy'`. Solo deployments see their historical memories without configuration. New tenant-aware queries opt into `'private'` or `'team'` explicitly.
- **Post-migration window** (operator-decided — see Operational Window section below): default flips to `'private'`. Legacy-era data remains queryable via explicit `memorySharing: 'legacy'`.

### 3. No back-fill — explicit rejection

**There is no migration script.** Untagged legacy rows stay untagged forever in SQLite. Tenants that want full historical access query with `memorySharing: 'legacy'` indefinitely. Tenants that want strict isolation use `memorySharing: 'private'` and accept that pre-migration data isn't in their view.

This is a deliberate architectural choice, not a temporary state. The absence of a migration script is the migration. The RLS filter simply shifts its bounds based on the runtime context.

### 4. Operational window and deprecation path

The `memorySharing` default flips from `'legacy'` to `'private'` when operators decide the untagged-surface-area has shrunk enough that default-legacy semantics no longer match the deployment's tenant-awareness expectations. Signals that guide the flip:

- **`healthcheck.migration.untaggedCount` trending toward zero** — observability surface shipped in point 5 below. Operators watch the trend and decide based on their deployment's write volume and legacy-data relevance.
- **Roadmap milestone** — the first real multi-user Memory Core deployment under `#9999` is a natural trigger for the flip on that deployment.

The flip itself is config-gated (`aiConfig.memorySharing?.defaultPolicy` — pattern borrowed from `#10253`'s `mailbox.defaultReplyPolicy`). No hard cutoff of legacy reads. Legacy rows remain queryable forever via explicit `memorySharing: 'legacy'` even after the default flips.

### 5. `healthcheck.migration.untaggedCount` observability

The Memory Core healthcheck surfaces a migration status block:

```json
{
  "migration": {
    "untaggedCount": {
      "memory":  <integer>,
      "session": <integer>,
      "total":   <integer>
    },
    "available": true
  }
}
```

Computed at healthcheck time via direct SQLite queries against `Nodes` table, filtering for `label IN ('MEMORY', 'SESSION')` with null or empty `userId` in properties JSON. Negligible cost (two `COUNT(*)` queries per healthcheck). Operators can scrape this field to track legacy-surface-area reduction over time as natural query-pattern shifts move writes toward 100% tagged coverage.

`available: false` is returned when the SQLite graph is not yet mounted (e.g., during pre-init healthchecks). This is a substrate-readiness signal, not a migration error.

## Operator Runbook

### Verifying a healthy migration baseline

After upgrading to the post-#10017 substrate, run:

```bash
# Via MCP tool
mcp call neo-mjs-memory-core.healthcheck
```

Inspect the `migration` block. Healthy states:

- `migration.untaggedCount.total: 0` with `available: true` → fully tagged; safe to flip default to `'private'` at any time.
- `migration.untaggedCount.total > 0` with `available: true` → legacy surface area present; keep default at `'legacy'` or flip based on operator judgment (see Operational Window above).
- `migration.available: false` → SQLite graph not yet mounted; retry after `GraphService.initAsync` completes.

### Flipping the default policy (post-migration)

When operators decide to flip `memorySharing` default from `'legacy'` to `'private'`:

```js
// ai/mcp/server/memory-core/config.mjs (or deployment-specific override)
memorySharing: {
    defaultPolicy: 'private'   // was: 'legacy' during migration window
}
```

Restart all MCP harnesses. Explicit `memorySharing: 'legacy'` queries continue to work for tenants who need legacy access; new reads without explicit flag scope to strict tenant isolation.

### Zero-config solo-developer invariant

The existing solo-developer zero-config path is preserved:
- The system defaults to the permanently unified topology (`#11014`)
- `NEO_AGENT_IDENTITY=<github-login>` binds the solo dev's identity
- `memorySharing: 'legacy'` default during migration window returns both tagged (post-upgrade) and untagged (pre-upgrade) memories transparently

No `.env` changes required for solo devs upgrading from the pre-#10144 substrate.

## Explicit Rejections (Avoided Traps)

- **Back-fill at migration**: rejected per section opening. Four concrete arguments documented.
- **Lazy-assign-on-read** (variant: tag untagged rows with the *reading* identity's tenant on first access): rejected. Worse than back-fill — creates phantom provenance based on retrieval order rather than authorship.
- **Hard-cutoff deprecation** (refuse `memorySharing: 'legacy'` after the window): rejected. Legacy rows have real historical value; refusing reads is user-hostile.
- **Per-tenant data isolation at storage layer** (separate Chroma instances per tenant): rejected at this layer. `#10016`'s metadata-filter approach with graph-native AUTHORED_BY edges is architecturally correct; separate-storage multiplies operational overhead without correctness gain.

## Cross-Reference

- `learn/agentos/tooling/MemoryCoreMcpAuth.md §Cross-Tenant Permissions` — authentication + permission edge types
- `ai/services/memory-core/HealthService.mjs` — `#checkMigrationState` implementation
- `ai/services/memory-core/MailboxService.mjs` line ~89 — write-side invariant exemplar
- `#10010` — `memorySharing` flag implementation (retrieval-side plumbing)
- `#10011` — SQLite RLS + tenant isolation (engine-layer enforcement)
- `#10016` — Multi-Tenant Identity & Data Privacy (parent sub-epic)
- `#10017` — this guide's anchor ticket
- `#9999` — Cloud-Native Knowledge & Multi-Tenant Memory Core (grand-parent epic)
