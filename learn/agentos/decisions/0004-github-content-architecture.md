# ADR 0004: GitHub Content Architecture — Universal Ordinal-100 Chunking

> Architectural Decision Record for the on-disk shape of `resources/content/` (issues, pulls, discussions, release-notes, archives).
> Codifies the graduated rule (operator-confirmed 2026-05-14) so future agent sessions V-B-A against this anchor *before* mutating substrate, instead of re-deriving (and bypassing) the design.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-05-14 (operator content-accuracy approval landed via "merge 0004 first" + "fine for me" directives 2026-05-14T18:53-18:54Z) |
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

### 1.3 The Regeneratable-Cache Strategic Principle (load-bearing strategic anchor)

`resources/content/` is a **fully-regeneratable cache**, NOT a source of truth. GitHub is the source of truth. `sync_all` is the canonical path back to a clean state from any local state.

**Operator authority anchor** (2026-05-15 nightshift A2A, verbatim):

> *"rationale: all data can be get from github. you can, if needed, delete the other items inside resources/content too. especially the meta file. we, and every other user, can sync ALL data from github. that was and is the strategy."*

**Concrete implications future authors V-B-A against:**

1. **Data-tier**: `<NNN>xx/` folders, `chunk-N/` folders, `.sync-metadata.json`, anything else in `resources/content/` — all deletable at will. Re-running `sync_all` regenerates everything from GitHub.
2. **Code-tier**: helpers like `chunkPath.mjs`, `archivePath.mjs`, `contentPath.mjs` are not load-bearing for data preservation. They're load-bearing only for CURRENT call sites; when call sites get rewired, the old helpers can be deleted simultaneously without data risk.
3. **`.sync-metadata.json` is also regeneratable**: deleting it just makes syncers treat the substrate as never-synced and re-emit fresh. This is feature, not bug — it's the simplest path to a clean state.
4. **Universal applicability**: not just the maintainer's local checkout. Per operator quote, "every other user" can sync ALL data from GitHub. The strategic principle holds across all deployment surfaces.

**Why this section is load-bearing**:

The clean-cut pattern (§2.6 per #11397) and the deprecation-theater anti-pattern (§5.6 per #11397) are CORRECT because of this strategic principle. Without it, future authors under preservation-tendency biases (RLHF graceful-degradation, "don't break working state", "preserve customer data" priors) don't have a § to V-B-A against — they pattern-match the preservation tendencies as positive signals and re-derive the data-preservation assumption.

**Historical pattern this section guards against** (operator-described 2026-05-15):

The pre-ADR-0004 "derailment" — team went from the exactly-100-items-per-folder original spec back to stream-based-IDs (`<NNN>xx/`) with almost-empty folders — was driven by the implicit assumption that on-disk state needed preservation across migration. The §1.3 strategic principle nullifies that assumption explicitly. Future agents recognizing preservation-pressure should pattern-match against §1.3 and choose deletion + re-sync over preservation + migration.

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

### 2.6 The Clean-Cut Pattern (load-bearing pattern, contrast with rejected Deprecation Window pattern)

The substrate-evolution pattern for ADR 0004 is **Clean Cut**, not **Deprecation Window**:

| Pattern | Old primitive after new primitive lands | Migration shape |
|---|---|---|
| **Clean Cut** ✓ (ADR 0004) | DELETED at the call-site-migration ticket | Data: clean-slate purge + re-sync (§3.6 + §9 item 10). Code: old file deleted in the same PR that mutates the last call site. |
| **Deprecation Window** ✗ (rejected) | KEPT with `@deprecated` JSDoc as thin shim during "migration window" | Data: preserved + reshaped via migration scripts. Code: both old + new primitives coexist with annotations bridging them. |

**Operator authority anchor** (verbatim from §3.6): *"if we just delete it all, especially the sync all meta file => clean slate => like we never had prior content. less cognitive load. no migration scripts needed. no risk of data loss either. allows full focus on the new syncer logic."*

The Deprecation Window pattern adds substrate-coexistence cost (cognitive load: "which primitive should I use here?"), violates §5.3 (parallel chunking rules), and contradicts the operator-stated "ZERO migration scripts planned" intent. Future authors V-B-A against this §2.6 contrast before designing helper-retirement work.

### 2.6.1 Mechanical enforcement layer (added 2026-05-16, ticket #11406)

§1.3 / §2.6 / §5.6 are **discipline-only** — pattern-recognition aids for agents reading merged ADR substrate before authoring. Empirical anchor proves they are necessary-but-not-sufficient: **PR #11403 Cycle-1** ([`PRR_kwDODSospM8AAAABAB3NsQ`](https://github.com/neomjs/neo/pull/11403#pullrequestreview-4296920497)) — same clean-cut regression recurred at the very next PR after the §2.6 layer merged, with `chunkPath.mjs` + `archivePath.mjs` + `ArchivePath.spec.mjs` preserved as dead code despite zero callers. The regression was caught at peer-review time, not CI time. The lookback distance between author-time and reviewer-time is the regression window.

**The mechanical layer closes this gap**:

| Artifact | Purpose |
|---|---|
| `ai/scripts/check-retired-primitives.mjs` | grep-fail check; scans `ai/` (excluding `*.spec.mjs` / `*.test.mjs`) for imports of any path fragment in the `RETIRED_PRIMITIVES` constant array; exits 1 on hit with file:line output + this §2.6 reference |
| `.github/workflows/check-retired-primitives.yml` | GitHub Actions workflow that runs the script on every PR + push to `dev` that touches `ai/**/*.mjs` |
| `npm run ai:check-retired-primitives` | Local dev alias for the same check |
| `test/playwright/unit/ai/scripts/checkRetiredPrimitives.spec.mjs` | Coverage: clean-substrate PASS + canary-regression FAIL + spec-glob-exclusion behavior |

**Extension protocol** when adding to §2.3 RETIRED:
1. Delete the retired primitive in the same PR that mutates the last call site (per §2.6).
2. Append the import-path fragment (e.g. `'shared/<name>.mjs'`) to the `RETIRED_PRIMITIVES` array in `ai/scripts/check-retired-primitives.mjs`.
3. The CI check then defends against future regressions where the deleted primitive gets reintroduced as an import.

Pattern-recognition + mechanical-enforcement are mutually reinforcing: without pattern-recognition (§1.3/§2.6/§5.6), the mechanical layer is brittle (someone has to maintain the array and know why); without mechanical enforcement, pattern-recognition relies on agents staying maximally attentive across all PRs (which empirically broke twice in one session: PR #11381 + PR #11403).

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

*(This is the operationalization of the strategic principle in §1.3)*

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

### 3.8 Graph ingestion impact (open V-B-A direction)

The substrate change affects **input shape** (where `.md` files live on disk) but should NOT affect **output shape** (the Native Edge Graph node schema — `id`, `title`, `body`, `state`, edges, etc.). Under that invariance:

- **Affected:** ingestors that read file paths (`IssueIngestor.mjs`, `TicketSource.mjs`, `PullRequestSource.mjs`, `DiscussionSource.mjs`) — already enumerated in §9 item 8
- **Likely unaffected:** graph consumers that consume node entries (`DreamService.mjs` REM-cycle daemon, gemma4 retrospective parsing pipeline) — they read from the graph, not from disk paths

**Open V-B-A item** (operator-flagged 2026-05-14, *"i am not sure if it affects DreamService and gemma4 parsing too. maybe not, if we consume the new input shape into the same graph items (output shape)"*): downstream ticket authors for §9 item 8 (consumer rewires) MUST verify the input-shape/output-shape invariance by reading:
- `ai/daemons/DreamService.mjs` for any hardcoded file-path expectations vs graph-node-only consumption
- gemma4 retrospective parsing pipeline (likely `ai/daemons/services/*Ingestor.mjs` or a sibling)
- Anywhere a `resources/content/...` path string appears in graph-related code

If invariance holds → no further work needed in DreamService / gemma4 layer. If a path-dependency surfaces → the consumer-rewires ticket scope expands to include the graph-layer touchpoints. Not pre-decided; V-B-A at the implementation moment.

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
- **Expected unit-test breakage during Phase 1 migration** (operator-acknowledged 2026-05-14): each downstream §9 item that mutates syncers / helpers / file-paths is likely to break specs that hardcode old shape. CI catches these per-PR, which is the right feedback loop — each PR cycle surfaces the test-side migration scope. Not a cost to avoid; a cost to expect + budget for in each Phase-1 ticket's AC list

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

### 5.6 Deprecation theater / preservation-window framing

Future agents MUST NOT add `@deprecated` JSDoc annotations to retired primitives (`chunkPath.mjs`, `archivePath.mjs`, etc.) under the framing "preserve as a thin backward-compatibility shim during migration window". Per §3.6 clean-slate framing, ADR 0004 prescribes **deletion**, not deprecation. The retired primitive's file gets DELETED when the call-site migration ticket lands — there is NO coexistence window where the old + new primitives both exist with deprecation annotations bridging them.

**Why the anti-pattern surfaces under RLHF-anchored deprecation tendency**: model families trained on broader software-engineering corpora have a strong prior toward "responsible legacy preservation" via `@deprecated` annotations + thin shims. This pattern is correct for typical industry-software lifecycle (LTS support, customer migration windows, semver-major-version-breaking-change discipline). It is **wrong** for Neo's substrate-evolution context where:

1. The operator explicitly named "ZERO migration scripts planned" + "clean slate => like we never had prior content" (ADR §3.6 operator quote).
2. The clean-slate purge runs as Task 10 — there's no customer data to preserve across the cut.
3. `@deprecated` shims are structurally §5.3's "parallel chunking rule" wearing different framing.

**Pattern recognition signals**: if your AC list contains language like "thin re-export wrapper for one deprecation window", "`@deprecated` JSDoc pointing to the new primitive", "backward-compat-compatible during Lane B migration", or "shim integrity" — these are RLHF-deprecation-tendency signals. Replace them with: "DELETED at the call-site-migration ticket", "removed in the same PR that lands the new primitive", or simply omit the framing entirely.

**The Cycle-1+Cycle-2 review chain anti-pattern**: cross-family reviewers under the same RLHF anchor will MISS this anti-pattern at review time unless §5.6 is explicitly cited. The author-side AC list sanctions the deprecation theater; the reviewer-side pattern-match reads "responsible legacy support" as positive signal. Operator-at-merge-gate becomes the catch-of-last-resort. §5.6 codifies the pattern so cross-family review can fire before operator-catch.

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

**Multi-session scope.** Per operator framing 2026-05-14: *"divide and conquer still applies. improving in iterations. we should add the full problem-scope, but we can tackle it inside multiple sessions. first reasonable goal: let us get the desired resources/content structure into the repo. step by step, no one shot. if this fully works, including syncs with delta updates, then we can look into missing other items."*

Phase boundaries below are the **gating discipline**: do not begin Phase 2 work until Phase 1 is operationally verified (structure landed + delta-update syncs working). The full scope is captured in this ADR so future sessions have the road-map; the sequencing prevents one-shot over-reach.

### Phase 1 — `resources/content/` structure (first session(s); blocks Phase 2)

Sequenced for **focus on new syncer logic first** (the value-delivery substrate per operator's clean-slate framing — no migration tooling to author):

1. **Universal helper:** consolidate `chunkPath.mjs` + `archivePath.mjs` into `contentPath.mjs` (includes the flat-when-only-`chunk-1/` UX-optimization decision per §2.3)
2. **Index map:** `_index.json` schema + maintenance in syncers
3. **`LocalFileService` rewrite:** index-based lookup
4. **Config audit:** drop `archiveDir` + `defaultArchiveVersion` (authority-bound per §3.7); decide implementation-tier keep-vs-fold on `archiveChunkPrefix` / `archiveChunkThreshold` / remaining flexibility
5. **Syncer updates:** all 3 syncers (`IssueSyncer`, `PullRequestSyncer`, `DiscussionSyncer`) consume `contentPath.mjs` + maintain `_index.json`
6. **Release-notes chunking:** new `ReleaseNotesSyncer` + chunking on 1200+ historical releases
7. **`publish.mjs` review:** verify archive-cut produces correct new shape (likely already correct since archives delegate to syncers)
8. **Consumer rewires (data-layer only):** recursive walk + index lookup in `TicketSource`, `PullRequestSource`, `DiscussionSource`, `IssueIngestor`
9. **Stale-reference cleanup in workflow-skill + docs surfaces** (per @neo-gpt PR #11368 Cycle 1 V-B-A): legacy `resources/content/issue-archive/` references survive in load-bearing workflow material and will mislead future sessions if not corrected after this ADR lands. Files needing review/update:
   - `.agents/skills/epic-review/references/epic-review-workflow.md`
   - `.agents/skills/tech-debt-radar/references/tech-debt-radar-guide.md`
   - `.agents/skills/ticket-create/references/ticket-create-workflow.md`
   - `.agents/skills/ticket-intake/references/ticket-intake-workflow.md`
   - `.agents/skills/ticket-triage/references/ticket-triage-workflow.md`
   - `learn/guides/fundamentals/CodebaseOverview.md`
10. **Clean-slate migration:** ONLY after 1-9 land. Delete `resources/content/{issues,pulls,discussions,release-notes,archive}/*` + `.sync-metadata.json` + run `sync_all`. No migration scripts authored — the new syncer logic does the emit work natively.

**Migration is LAST in Phase 1, not first.** Until new syncer logic exists, deletion is destructive without recovery shape; once new logic exists, deletion + fresh emit is the migration.

### Phase 1 → Phase 2 gate

Phase 2 work begins ONLY after:
- All Phase 1 items 1-10 are merged
- `sync_all` operates correctly with **delta updates** (not just full re-syncs)
- `resources/content/` structure on dev matches §2.1 target shape
- No regressions in KB ingestion or Native Edge Graph consumption
- **`/tech-debt-radar` sweep run** (operator-recommended 2026-05-14) at phase-gate to surface anything missed — covers the "did Phase 1 leave any silent stale-state debris we didn't catch in per-PR CI" question that's hard to answer from inside individual PR reviews

### Phase 2 — Consumer / Portal / SEO substrate (multi-session, post-Phase-1)

Each item likely becomes its own Epic with sub-tickets. Captured here for future-session road-map; do not start until the Phase 1 gate clears.

11. **`buildScripts/docs/index/` refactor:** `tickets.mjs` and `release.mjs` currently generate monolithic JSON consumed by the portal app. Refactor to tree-folder-shaped indexes that enable lazy-load on expand. Aligns the generator shape with the new `chunk-N/` substrate.
12. **Portal app tree-folder consumption:** the portal already has tickets to show discussions + PR conversations; extend the consumer logic to render the nested chunk-N folder structure with lazy-load on expand. Replaces "load N MB of JSON upfront" with "load chunk on demand."
13. **SEO substrate update:** `sitemap.xml` + `llms.txt` regenerate from the new tree structure. Each chunk + each individual item gets crawler-visible paths.
14. **middleware-v2 routing impact** (separate `neomjs/middleware-v2` repo): pre-generated "real fake routes" for client-side-hash routes. Googlebot + LLM crawlers can't parse `#`-based routes or run JS reliably. Neo's left hemisphere is the differentiator here: server-side VDOM/VNode + string parser generates the body in node without headless browsers (no Puppeteer / no Chrome). This is the kind of work that demonstrates Neo's substrate advantage over framework-category competitors that need browser shells for SSR.

### Why this phasing matters

The Phase 1 / Phase 2 boundary is not bureaucratic — it's the **risk-reduction discipline**. Phase 2 work depends on `resources/content/` being correctly shaped + index-map operational + delta-syncs working. Trying to refactor portal + SEO + middleware-v2 while the underlying substrate is still in flight is the substrate-bypass anti-pattern in a different surface area (§5 generalization). Land the foundation, verify it operates, then climb.

The full scope is captured here so future sessions don't lose the road-map — but the gating prevents one-shot over-reach.
