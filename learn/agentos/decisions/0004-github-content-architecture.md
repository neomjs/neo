# ADR 0004: GitHub Content Architecture — Universal Ordinal-100 Chunking

> Architectural Decision Record for the on-disk shape of `resources/content/` (issues, pulls, discussions, release-notes, archives).
> Codifies the graduated rule (operator-confirmed 2026-05-14) so future agent sessions V-B-A against this anchor *before* mutating substrate, instead of re-deriving (and bypassing) the design.

| Attribute | Value |
|---|---|
| **Status** | Draft — 2026-05-14 (committed for review on PR #11368; flips to `Accepted` after operator content-accuracy approval, pre-merge) |
| **Author** | @neo-opus-4-7 drafting; architecture authored by swarm across Discussion #11180, Epic #11187, Discussion #11359, operator corrections 2026-05-14 |
| **Documents** | Epic #11187 (Adopt single-root archive with lazy 100-item chunking) — **supersedes Cycle 2 amendment** with operator-confirmed Reading X (universal ordinal) |
| **Supersedes** | (a) Implicit shape pre-Discussion-#11180 (asymmetric `issue-archive/` + `pr-archive/` fragmentation); (b) Option G per-type density-tuning (operator-revised 2026-05-14); (c) Active-tier `<NNN>xx/` GitHub-ID-range chunking via `chunkPath.mjs` (operator-revised 2026-05-14 to ordinal-100) |
| **Informs** | All future migrations, syncer authors, KB consumer audits, MCP-server boot recovery, release pipeline |
| **Anti-anchor for** | Substrate-bypass authoring (the #11362 failure mode) |

---

## 1. Context

`resources/content/` is the on-disk durable representation of GitHub Issues, Pull Requests, Discussions, and Release Notes consumed by:
- Knowledge Base ingestion (`TicketSource`, `PullRequestSource`, `DiscussionSource`)
- Docs ticket-index generator
- SEO route collector
- Native Edge Graph ingestor (`IssueIngestor.mjs`)
- Post-merge agents reading historical state to inform new work

### 1.1 The Friction

- **GitHub's 1000-file folder UI cap** — flat `issues/` exceeded 1000 files in 2026-Q2 (`#11113`)
- **Pre-2026-05-11 asymmetry** — `issue-archive/v*/XXxx/` (hybrid version + ID-range) vs `pr-archive/XXxx/` (no version) vs no `discussion-archive/`
- **Density-tuning regret (Option G)** — Discussion #11180 graduation initially picked per-type density-tuning (Issues chunked / PRs chunked / Discussions flat). Operator-revised 2026-05-14 — more ideation sandboxes coming; sparse-folder assumption breaks
- **Migration footguns** (`migrate-pr-archive-ac8.mjs --fallback-version v13.0.0`) pre-staged 195 PRs into a sealed-chunk-violating bucket before v13 was cut
- **GitHub-stream chunking framing** — `<NNN>xx/` ID-range chunking was reasoned about using the unified-GitHub-ID-stream math; operator V-B-A rejected this framing as wrong-anchor 2026-05-14: *"NOT relate to github 'stream' ids, but our own mathematically sound real 100"*
- **Inconsistency creep** — two chunking primitives (`chunkPath.mjs` ID-range for active, `archivePath.mjs` ordinal for archive) added cognitive load; operator-corrected: *"consistency is key. same for all. own id chunks. no here we use A, there we use B. clean architecture design."*

### 1.2 The substrate-bypass anti-pattern

PR #11362 (commit `559c73d43`) implemented "Phase 6 cleanup" by **deleting** 3,153 issue-archive items + 18 pr-archive items + 195 in-progress v13 archive items, instead of **reshaping** them per Epic #11187 Phase 3 ACs. The author (me, @neo-opus-4-7) read Discussion #11359 graduation framing — *"archive folders for vN.M.K are created at release-cut by publish.mjs, never pre-staged"* — and inferred "delete legacy archives," when the explicit Phase 3 ACs mandated reshape, not delete.

This ADR's primary purpose is to **anchor the graduated architecture as load-bearing single-source-of-truth so future agents V-B-A against ONE document instead of re-inferring from multi-Discussion graduation contexts.**

---

## 2. Decision

The `resources/content/` substrate uses a **single universal ordinal-100 chunking primitive** for ALL tiers (active + archive) and ALL content types (issues, pulls, discussions, release-notes).

### 2.1 Target on-disk shape

```
resources/content/
├── issues/chunk-N/issue-NNNN.md                          (active, ordinal-100)
├── pulls/chunk-N/pr-NNNN.md                              (active, ordinal-100)
├── discussions/chunk-N/discussion-NNNN.md                (active, ordinal-100)
├── release-notes/chunk-N/release-VV.MM.PP.md             (no archive tier; ordinal-100)
└── archive/
    ├── issues/v<X.Y.Z>/chunk-N/issue-NNNN.md             (sealed per release, ordinal-100)
    ├── pulls/v<X.Y.Z>/chunk-N/pr-NNNN.md                 (sealed per release, ordinal-100)
    └── discussions/v<X.Y.Z>/chunk-N/discussion-NNNN.md   (sealed per release, ordinal-100)
```

No `<NNN>xx/` folders. No GitHub-ID-stream math. No flat-vs-chunked branching. One primitive, one rule, applied universally.

### 2.2 The Universal Ordinal-100 Rule

For any content collection (e.g., active issues, archived discussions for v12.1.0, all release notes):

1. **`itemCount` = total items in the collection** (active type or sealed archive-version bucket)
2. **`itemIndex` = zero-based ordinal position** by insertion order (deterministic from time/ID/whatever the consistent ordering is)
3. **If `itemCount ≤ 100`:** all items live in a single `chunk-1/` directory under the bucket
4. **If `itemCount > 100`:** items distributed across `chunk-1/`, `chunk-2/`, ..., `chunk-N/` with each chunk holding exactly 100 (except possibly the last)
5. **Chunk computation:** `chunkNumber = Math.floor(itemIndex / 100) + 1`

**This is OUR OWN mathematically sound real-100.** It does NOT derive from GitHub IDs. Two collections of the same size produce identically-shaped chunks regardless of GitHub-ID gaps.

### 2.3 Retired primitives

- **`ai/services/github-workflow/shared/chunkPath.mjs`** (3-line `String(id).padStart(4,'0').slice(0,-2) + 'xx'`) — RETIRED. ID-range chunking abandoned everywhere.
- **`<NNN>xx/`** folder naming — RETIRED. `chunk-N/` universal.
- **`pr-<NNN>xx/`** prefix-disambiguation — RETIRED. Per-type top-level directories already disambiguate; chunk subdir doesn't need a type prefix.
- **Active-tier O(1) lookup via `LocalFileService#getIssueById`** — RETIRED. Replaced by index-map lookup (see §3.3).
- **`archivePath.mjs` "flat ≤100 / chunked >100" branching** — RETIRED conceptually. The simpler rule "always under `chunk-N/`" eliminates the branch; first chunk just happens to be `chunk-1/` whether the bucket has 1 item or 100. (Whether the helper implementation keeps a flat-when-only-`chunk-1/` UX optimization is an implementation-tier decision routed to the universal-helper downstream ticket per §9 item 1; not authority-bound to this ADR.)

### 2.4 `prevent-reopen.yml` is the load-bearing immutability primitive

`.github/workflows/prevent-reopen.yml`:
- Reopen attempt within 24h grace period → allow
- Reopen attempt past 24h → CI auto-re-closes + creates new ticket `${title} (reopened from #N)`, body `Originally: #N\n\n${body}`, labels preserved

**Mechanical consequence:** post-24h-grace, `closedAt` is HARD-IMMUTABLE → archive placement is CI-enforced stable → sealed-chunk semantics are an automated primitive. This is what makes the ordinal chunking safe — chunk membership never shifts retroactively once a chunk is sealed.

### 2.5 Insertion-order semantics

For each collection bucket, `itemIndex` is determined by stable canonical order:
- **Active tier** by ascending GitHub ID (issue number / PR number / discussion number / release version)
- **Archive tier** by ascending GitHub ID within each version-folder bucket
- **Release notes** by ascending semver

Within a chunk, files are named by GitHub identifier (`issue-NNNN.md`, `pr-NNNN.md`, `discussion-NNNN.md`, `release-VV.MM.PP.md`) — preserving searchability by ID.

---

## 3. Implementation Details

### 3.1 Single universal helper

Consolidate `chunkPath.mjs` + `archivePath.mjs` into one universal helper:

```javascript
// ai/services/github-workflow/shared/contentPath.mjs (proposed name)
export default function contentPath({contentRoot, type, version, filename, itemIndex, itemsPerChunk = 100}) {
    const chunkNumber = Math.floor(itemIndex / itemsPerChunk) + 1;
    const chunkDir    = `chunk-${chunkNumber}`;
    const bucketDir   = version
        ? path.join(contentRoot, 'archive', type, version)
        : path.join(contentRoot, type);
    return path.join(bucketDir, chunkDir, filename);
}
```

Single primitive serves all tiers and all types. Path-routing-by-version becomes a parameter; the chunking math is invariant.

### 3.2 Index-map substrate (replaces O(1) ID lookup)

Because chunk position is no longer derivable from GitHub ID alone (a non-existent ID has no folder; sparse-density doesn't matter — what matters is `itemIndex`), consumers need an index to find an item by ID:

- New `resources/content/_index.json` (or per-type `_index.json` shards) maintained by syncers
- Schema: `{type, id, version, chunkNumber, path}` per item
- Updated at sync time alongside item write
- `LocalFileService#getIssueById` reads the index; O(1) hashmap lookup remains; no folder-scan-per-lookup

### 3.3 Syncer write-paths

All 3 syncers (`IssueSyncer`, `PullRequestSyncer`, `DiscussionSyncer`) + new `ReleaseNotesSyncer` consume the universal helper. Each syncer:
1. Computes `itemCount` for its type (active) or for each version-bucket (archive)
2. Computes `itemIndex` per item from stable canonical order
3. Calls `contentPath()` to determine target path
4. Writes file + updates index

### 3.4 Release-cut substrate

`buildScripts/release/publish.mjs` calls `GH_SyncService.runFullSync()` then regenerates ticket index. Archive placement delegated to syncers. Release-notes write-path uses the same universal helper.

### 3.5 Consumer recursion + index lookup

All consumers MUST:
- Scan recursively under `resources/content/{type,archive/{type}/v*}/chunk-*/` for content
- Use `_index.json` for ID-keyed lookups
- Never assume folder name encodes item ID (the ID-encoding-in-folder-name semantic is RETIRED)

### 3.6 Migration shape: clean-slate purge (operator-directed 2026-05-14)

Operator quote: *"if we just delete it all, especially the sync all meta file => clean slate => like we never had prior content. less cognitive load. no migration scripts needed. no risk of data loss either. allows full focus on the new syncer logic."*

**THE migration approach** (not one option of several):

1. **Delete all of `resources/content/{issues,pulls,discussions,release-notes,archive}/`** working copy
2. **Delete `resources/content/.sync-metadata.json`** — critical: without this file, syncers treat the substrate as if it has never been synced, so every item re-emits fresh
3. **Run `sync_all`** which re-pulls from GitHub source-of-truth (rate-limited, multi-pass; ~2k items per batch under GH limits)
4. **Syncers emit using the new universal ordinal-100 shape** — no migration code path, no reshape logic, no "old shape detection / new shape conversion." Just fresh emit.

**Anti-patterns explicitly rejected by this directive:**
- One-shot reshape scripts (e.g., `migrate-*.mjs` of the kind #11362 used) — these add cognitive load + risk; not needed when GitHub is source-of-truth
- "Preserve git history" framing — git history is preserved by the DELETE commit itself; you can `git show <pre-purge-sha>:resources/content/...` to retrieve any historical shape
- "Edge case handling for items that fail to resync" — covered by re-running `sync_all`; rate-limits are mechanical not architectural

**Operator's underlying principle:** focus team attention on **new syncer logic** (the value-delivery substrate), not on migration tooling (zero-cognitive-leverage scaffolding).

### 3.7 Config audit

`ai/mcp/server/github-workflow/config.template.mjs` + `config.mjs` currently expose path configurability — e.g., `archiveDir`, `archiveRoot`, `archiveChunkPrefix`, `archiveChunkThreshold`, `defaultArchiveVersion`. Original rationale: flexibility for other users (when only tickets + release notes existed in the substrate).

Post this ADR, much of that flexibility is historical debt. **Authority-level decisions captured here:**

- `archiveDir` (legacy single `issue-archive/`) — DROPPED. Already retired by #11362's source primitives; config field eliminated under universal architecture.
- `defaultArchiveVersion: 'unversioned'` — DROPPED entirely. Pre-stage anti-pattern primitive; sealed-chunk semantics make this field architecturally invalid.

**Implementation-tier scope** (routed to the config-audit downstream ticket per §9 item 4, NOT authority-bound to this ADR):

- `archiveChunkPrefix: 'chunk-'` — keep configurable vs fold-to-constant. Tradeoff is small-surface flexibility vs less-surface-to-test. Either direction supports the architecture; the universal rule does not depend on the prefix string.
- `archiveChunkThreshold: 100` — keep configurable for future-tuning vs hardcode to 100. Same tradeoff shape.
- Other path-configurability surfaces — keep or drop, decided by the config-audit ticket against actual user-flexibility consumers.

The config-audit ticket (§9 item 4) consumes this ADR as authority for the DROPPED items and exercises judgment on the implementation-tier items.

---

## 4. Consequences

### Positive

- **Single substrate anchor:** future agents have ONE document to V-B-A against before authoring migrations / syncer changes / consumer audits
- **Symmetric across types AND tiers:** one mental model serves all content; sync code branches only on type-name, not on shape primitive or tier
- **Consistent reasoning:** "chunk-N" means the same thing everywhere (archive-tier v12.1.0 / active issues / release notes — all use `chunk-N/` with the same ordinal math)
- **Sealed-chunk semantics CI-enforced:** `prevent-reopen.yml` guarantees archive immutability; no voluntary discipline required
- **GitHub-ID-stream-math anti-pattern eliminated:** the false framing that "100 IDs across types ≈ 100 items per chunk" is no longer reachable; the math is ordinal on planned items
- **Density-future-proof:** ordinal primitive handles growth automatically; no special-case "flat-or-chunked" branching; no Option-G-style density-tuning regret possible

### Negative

- **O(1) `getIssueById` loss:** active-tier no longer encodes ID in folder name; index map substrate required (cost: `_index.json` maintenance + read-path)
- **Migration cost:** ~3,366 archive items + ~1300 active items + 1200+ release notes need reshape (delete + resync via `sync_all`)
- **Path configurability tension:** users who relied on `archiveDir` etc. for namespace customization see narrower surface (operator to decide audit scope)
- **First-cycle learning cost:** existing agents (including me) anchored on the two-primitive model need to update mental model

---

## 5. Anti-Patterns (Substrate-Bypass Prevention)

Future agents authoring `resources/content/` migrations or syncer changes MUST avoid these patterns:

### 5.1 Reading Discussion graduation prose as deletion-license

The Discussion #11359 framing *"archive folders for vN.M.K are created at release-cut by publish.mjs, never pre-staged"* is about **forward write-paths** (no new pre-stage of not-yet-cut releases), NOT a delete-mandate on existing v8-v12 archives. The forbidden inference: *"pre-Epic-#11187 archives are 'legacy' → delete."* The correct inference: *"pre-Epic-#11187 archives should be RESHAPED into the new `archive/{type}/v<X>/chunk-N/` shape."*

### 5.2 Anchoring on GitHub-ID-stream math

The framing *"Because Issues, PRs, and Discussions share the same auto-incrementing ID stream, a 100-ID chunk contains ≤100 items total across types"* is a wrong anchor. The graduated rule is **ordinal-100 on planned items**. ID-stream math is a coincidence of historical primitive design (now retired); not the rule.

### 5.3 Inventing parallel chunking rules

This ADR codifies ONE primitive. Any proposal to introduce a second chunking algorithm (e.g., "ID-range for active because O(1) lookup matters" or "flat for sparse types because density") MUST first cite this ADR and propose a Cycle 4 amendment via Ideation Sandbox + cross-family consensus. Substrate-evolution via fresh primitive-invention is the substrate-bypass failure mode.

### 5.4 Skipping `prevent-reopen.yml` in the mental model

The 24h-grace + auto-re-close-and-new-ticket workflow is the architectural foundation of sealed-chunk semantics. Any proposal that doesn't account for it (e.g., "rebalance chunks on `closedAt` shift") is wrong-shape.

### 5.5 Treating per-type configurability as architecture

The current config surface (`archiveDir`, `defaultArchiveVersion`, etc.) reflects HISTORICAL flexibility when the substrate was simpler. The universal ordinal-100 rule does not need per-type or per-namespace config; the architecture is the architecture. Future agents adding "configurable folder names" to the config surface MUST justify against this ADR.

---

## 6. V-B-A Pre-Flight for Future Authors

Before authoring any file in:
- `ai/services/github-workflow/sync/*.mjs`
- `ai/services/github-workflow/shared/*Path.mjs` (or successor `contentPath.mjs`)
- `ai/mcp/server/github-workflow/config{,.template}.mjs`
- `ai/scripts/migrate-*.mjs` (or any one-shot migration)
- `ai/daemons/services/IssueIngestor.mjs`
- `buildScripts/release/publish.mjs`
- any consumer of `resources/content/...`

You MUST:
1. Read this ADR start-to-finish
2. Read the universal helper file AND its JSDoc rationale
3. Read `.github/workflows/prevent-reopen.yml`
4. Read `resources/content/_index.json` schema (once it exists)
5. V-B-A any pattern you find in current code against the universal rule in §2
6. If the current code diverges from this ADR (e.g., legacy `chunkPath.mjs` calls), the FIX is migrate-to-universal, NOT add-a-second-primitive

---

## 7. Related

- **Discussion #11180** — parent ideation; full divergence matrix + 3-way swarm convergence; Option G graduation that this ADR supersedes via operator-revision 2026-05-14
- **Discussion #11359** — Phase 6 graduation that triggered the #11362 substrate-bypass
- **Epic #11187** — Cycle 2 amended; this ADR supersedes via Cycle 3 (Reading X confirmed by operator)
- **PR #11193** — introduced `archivePath()` ordinal primitive; partial precursor for universal ordinal
- **PR #11114, #11123, #11125, #11129** — introduced `chunkPath()` active primitive (now retired)
- **PR #11284** — flattened active discussions (Option G implementation; superseded)
- **PR #11286** — initial migration to `archive/{type}/v<X>/` shape
- **PR #11362** — substrate-bypass failure this ADR anti-anchors against
- **`.github/workflows/prevent-reopen.yml`** — load-bearing immutability primitive

---

## 8. Status / Lifecycle

- **Draft (this version)** awaiting operator approval before commit
- **Accepted** once operator confirms accuracy + completeness
- **Periodic re-review trigger:** any substrate-mutation PR touching `resources/content/` shape or content-path primitives MUST cite this ADR in its body; reviewer-side audit fires if absent

Origin Session ID: `cf76b29a-9cf5-4c35-a415-37d631a8a755`

Retrieval Hint: `query_raw_memories("github content architecture ADR universal ordinal chunk 100 prevent-reopen")` or commit-range `8a1906221..559c73d43` for the substrate-bypass evidence

---

## 9. Downstream Tickets (out-of-scope for THIS ticket; file as separate after ADR graduates)

Sequenced for **focus on new syncer logic first** (the value-delivery substrate per operator's clean-slate framing — no migration tooling to author):

1. **Universal helper:** consolidate `chunkPath.mjs` + `archivePath.mjs` into `contentPath.mjs` (includes the flat-when-only-`chunk-1/` UX-optimization decision per §2.3)
2. **Index map:** `_index.json` schema + maintenance in syncers
3. **`LocalFileService` rewrite:** index-based lookup
4. **Config audit:** drop `archiveDir` + `defaultArchiveVersion` (authority-bound per §3.7); decide implementation-tier keep-vs-fold on `archiveChunkPrefix` / `archiveChunkThreshold` / remaining flexibility
5. **Syncer updates:** all 3 syncers (`IssueSyncer`, `PullRequestSyncer`, `DiscussionSyncer`) consume `contentPath.mjs` + maintain `_index.json`
6. **Release-notes chunking:** new `ReleaseNotesSyncer` + chunking on 1200+ historical releases
7. **`publish.mjs` review:** verify archive-cut produces correct new shape (likely already correct since archives delegate to syncers)
8. **Consumer rewires:** recursive walk + index lookup (`TicketSource`, ticket-index, SEO routes, `IssueIngestor`, `PullRequestSource`, `DiscussionSource`)
9. **Stale-reference cleanup in workflow-skill + docs surfaces** (per @neo-gpt PR #11368 Cycle 1 V-B-A): legacy `resources/content/issue-archive/` references survive in load-bearing workflow material and will mislead future sessions if not corrected after this ADR lands. Files needing review/update:
   - `.agents/skills/epic-review/references/epic-review-workflow.md`
   - `.agents/skills/tech-debt-radar/references/tech-debt-radar-guide.md`
   - `.agents/skills/ticket-create/references/ticket-create-workflow.md`
   - `.agents/skills/ticket-intake/references/ticket-intake-workflow.md`
   - `.agents/skills/ticket-triage/references/ticket-triage-workflow.md`
   - `learn/guides/fundamentals/CodebaseOverview.md`
10. **Clean-slate migration:** ONLY after 1-9 land. Delete `resources/content/{issues,pulls,discussions,release-notes,archive}/*` + `.sync-metadata.json` + run `sync_all`. No migration scripts authored — the new syncer logic does the emit work natively.

**Migration is LAST, not first.** Until new syncer logic exists, deletion is destructive without recovery shape; once new logic exists, deletion + fresh emit is the migration.
