# Release Notes Workflow — epic-scale, memory-mined, iterated to the bar

Authoritative protocol for authoring Neo.mjs release notes. Born from the v13.1 lineage (epic `#14483`): the v13.0 notes reached their bar through seven *unformalized* iteration leaves (`#12695` → `#12700`/`#12716`/`#12729`/`#12811`/`#12815`/`#12924`) and the process was lost — every release re-derived it. This payload is that process, kept.

Release notes are a **public narrated release**, ingested twice: humans read the story; the KB/graph ingests the chunked mirror (`ReleaseNotesSyncer` / `ReleaseNotesSource`). Both consumers punish a changelog dump.

## §1 The iteration model (the core rule) — `DISCIPLINE-ONLY`

**Release notes are an EPIC with multiple iterations BY DESIGN — never a single-pass PR.** (Operator directive, 2026-07-02: "multiple iterations ARE needed"; the single-pass v13.1 first draft empirically carried environment errors, one-lens narration, and downplaying.)

1. File the notes epic per `/epic-create` (problem + intended solution; leaves link incrementally). The authoring leaf, the cut-mechanics leaf, and refinement leaves are separate one-PR deliverables.
2. **Iteration 1 merges deliberately early** with an explicit in-document banner: `> **Status: iteration 1 of N — a deliberately-early draft.** …` — the draft is a living staging document on dev.
3. Mining-driven refinement leaves (one per arc/chapter, §3) iterate until the §7 cut-readiness checklist passes. The final iteration removes the banner.
4. **Do NOT downplay the release.** A window's headline arc is not its extent; scope framing that shrinks the release ("X is just a Y release") fails review. When the true magnitude is fuzzy (unfiled work, §2), say so honestly rather than rounding down.

## §2 Scope derivation — the tracker lags reality — `DISCIPLINE-ONLY`

Derive the window from **multiple sources, trusting none alone**:

- `node buildScripts/release/analyzeClosedSinceRelease.mjs <prev-release-date> --format markdown` — cutoff = the previous release commit date (`git log -1 --format=%ai -S '"version"' package.json` or the release tag). Gives merged-PR / closed-issue / epic-closure counts + author/scope/label breakdowns. Re-run at the cut boundary (its own freshness note says local mirrors staleness).
- The release project board(s) — but **board state ≠ shipped reality in EITHER direction**: a board can look "mostly done" simply because tickets for the remaining work were never filed (v13.1 empirical: 19 todo / 2 in progress / 139 done while an estimated 300–500 changes had no tickets at all), and done-columns can contain deferred-in-substance items.
- Epic closures in the window (`gh issue list --search "label:epic closed:>DATE"`), milestone views, and **the operator's magnitude estimate** — ask; the human carries the unfiled-work picture no tracker has.
- Whether to *mention* the unfiled mass in the notes is an editorial call per iteration ("maybe!") — but it must inform scope framing either way.

## §3 Heavy Memory-Core mining per arc — `DISCIPLINE-ONLY`

Ticket titles do not tell stories; sessions do. Per candidate hero chapter, run a 3–10-call mining sweep **before drafting the chapter** (`/memory-mining` discipline):

- `query_summaries` / `query_raw_memories` on the arc's vocabulary (the incident name, the subsystem, the epic number) — surface the turning points, dead ends, and corrections the chapter must narrate.
- `get_all_summaries` / session rollups bounded to the window for chronology.
- A chapter without mining behind it is a candidate, not a chapter. The hero chapters are the arcs where the mining came back DEEP (real friction, real reversals, numbers) — not the arcs that sound impressive.
- War-Story chapters additionally mine the incident's forensics tickets end-to-end (Symptom → Investigation → Culprit → Fix-the-class, §5).

## §4 Per-claim V-B-A — `MACHINE-ENFORCEABLE-CANDIDATE` (review-side)

Every factual claim in the notes carries a verifiable source (ticket, PR, commit, measurement artifact) — verified against the PRIMARY at writing time, not from memory. The v13.1 iteration-1 miss ledger is the empirical anchor for the claim classes that slip:

- **Environment claims:** the `#13999` incident was the LOCAL Agent OS deployment; the draft framed it cloud. Self-healing is cloud-MOTIVATED, not cloud-LIMITED. State deployment environments only from the incident's primary tickets.
- **Scope claims:** "X is an <subsystem> release" / "Y unchanged" require a window-wide check, not a headline-epic check (§2).
- **Designation claims:** `Release Type` / `Stability` lines are operator-confirmed, never inferred (v13.0 shipped as "Release Candidate"; the successor's designation is the operator's call).
- Reviewer side: the cross-family review (§5) spot-verifies claims against their anchors; an unanchored claim is a Required Action, not a nit.

## §5 The quality bar — the precedent SET — `DISCIPLINE-ONLY`

The measurable precedent is a **set, never one file** — majors AND minors both carry the bar (operator, 2026-07-02: the minors are "really really good quality too… I would not limit the bar to just one example"). All post-publish mirrors under `resources/content/release-notes/chunk-N/`:

- `v13.0.0.md` — the major: five hero chapters, institution-scale narrative.
- `v12.1.0.md` — TL;DR with an **honest velocity qualifier in the unflattering direction** (a lower tickets/day number contextualized by scope-depth, not hidden); `> [!NOTE]` alert-block sidebars carrying verbatim human-AI moments (the "Cyborg Guardrail" recovery-prompt, quoted).
- `v11.24.0.md` — **named-paradox velocity case studies with actual clock-time** ("Stephanie++"; "architected, implemented, and polished in 3 hours, 33 minutes"), before/after Mermaid sequence diagrams, "Code in Action" snippets.
- `v11.23.0.md` / `v11.22.0.md` — case-study-led and principle-led minor shapes; both close with a **Full Changelog** tail.

**Minor releases are NOT lean changelogs** — same hero-piece discipline at scoped size: one named case study or principle may lead instead of five chapters, but the narrative, sourcing, and honesty contract is identical. Structural contract (shared across the set):

- **Header block:** `# Neo.mjs vX.Y.Z Release Notes` (the H1 becomes the GitHub-release title, §6) + `Release Type` / `Stability` / `Upgrade Path` lines.
- **TL;DR blockquote** — the release in one breath, positioned against what came before.
- **"vX.Y in 2 Minutes"** — the one line, the stat, the gates/proofs, the honest bound.
- **Hero chapters** — the mined arcs (§3); v13.0 carried five. Each narrates change, evidence, and numbers; each stands alone.
- **War Story** (when the window carries one): Symptom → Investigation → Culprit → **Fix-the-class** (never the point-fix), with numbers.
- **Honest bounds** — what is proven vs what is the standing watch; test-borne vs production-borne evidence, stated in-document. Velocity/scale numbers qualified in BOTH directions (`v12.1.0.md` contextualizes a *lower* number; silence is the failure mode).
- **Named case studies with real timelines** — bug names as narrative hooks, actual clock-time, verbatim human moments in `> [!NOTE]` sidebars; Mermaid before/afters (render-verified before merge — `guide-authoring-bar` §3) and code-in-action where the story is architectural.
- **Continuity / upgrade path** — what existing users do, what defers to the next release (minors use the drop-in-replacement idiom where true, per `v11.24.0.md`).
- **Full Changelog tail** — the grouped enumeration closes the document (regenerated at cut boundary, §2), after the narrative, never instead of it.
- **Bans:** changelog-dump structure (grouped appendices SUPPORT the story via the §2 script, never replace it); unsourced superlatives; scope-shrinking framings (§1, rule 4).
- **Cross-family review before every iteration merges** — same rule as blog posts; authority-adjacent claims reviewed LAST per the blog bar.

## §6 Publish-flow mechanics — the staging-file lifecycle — `MACHINE-ENFORCEABLE-CANDIDATE`

The authoring surface is **`resources/content/release-notes/v{version}.md` at the flat directory root** — this is a hard `buildScripts/release/publish.mjs` contract, not a convention:

1. **Pre-flight requires it** (`publish.mjs` §1): the release ERRORS if the file is absent. The version comes from `package.json` (bumped manually before the cut).
2. The file is **committed and iterated on dev** ahead of the cut (§1) — the v13.0 lineage precedent, formalized.
3. At cut time publish.mjs appends the **atomic-changelog-hash line** (post squash-to-main), parses the file — frontmatter stripped, first H1 extracted as the release title — and runs `gh release create` (cascades to npm).
4. **publish.mjs itself removes the flat file post-release**; the SECOND runbook command — `npm run ai:post-release-sync` (fail-closed preflight; publish prints it) — then re-materializes the published release under `chunk-N/` with frontmatter, regenerates the ticket index, and commits the archive moves (`_index.json` is syncer-maintained — never hand-edit). Two commands since the severance: ADR 0004 §3.4.
5. **The orphan guard** (`test/playwright/unit/ai/buildScripts/release/PublishReleaseNoteOrphan.spec.mjs`) polices the flat root. Its correct scope is the post-publish defect class — a flat file lingering ALONGSIDE its chunk-N mirror — and the `#14484` leaf narrows it to exactly that. **Check the spec's state on YOUR merge base before relying on staging-file passage:** an absolute empty-flat-root assertion means the narrowing has not landed yet (a staging file then trips `unit` until it does). Either way the principle holds: a staging file for an unpublished version is the DESIGNED state — never "fix" guard friction by relocating the notes out of the pipeline contract (attempted and operator-reverted in the v13.1 window).
6. **Sync-guard interplay:** the husky pre-commit classifies `resources/content/release-notes/**` as sync-data; flat-root staging commits use `--no-verify` per the pipeline's own precedent (publish.mjs commits this file `--no-verify` internally). Keep such commits single-file so no other hook coverage is silently skipped.
7. Known observation (epic-tracked): `buildScripts/docs/index/release.mjs` scans flat files recursively, so a committed staging note surfaces its version in `releases.json` when the docs index regenerates pre-cut.
8. **The cut itself is human-only** (`§critical_gates`): agents prepare (notes, `prepare.mjs` validation, checklist) and hand off; `publish.mjs` execution and the dev→main release line belong to the operator.

## §7 Cut-readiness checklist — `MACHINE-ENFORCEABLE-CANDIDATE`

The notes epic's final iteration passes when:

- [ ] Iteration banner removed; content reviewed cross-family at final head
- [ ] `Release Type` / `Stability` designations operator-confirmed (§4)
- [ ] Scope numbers regenerated at the cut boundary (§2 re-run) and reconciled in-document
- [ ] Every claim anchor-verified (§4); the numbers-verify sweep (the `#14327` class, "sequence LAST") has run against the final text
- [ ] The staging file sits at the flat root with the version matching `package.json`'s bump
- [ ] The operator publish-handoff comment is posted on the cut-mechanics leaf (checklist + explicit "publish is yours")

## Lifecycle position

| Sibling | Boundary |
|---|---|
| `/epic-create` | files the notes epic; this skill fills its leaves |
| `/memory-mining` | the §3 grounding engine |
| `/blog-post` | narrative posts; shares the sourcing bar, different artifact + venue |
| `/update-roadmap` | the POST-release beat (celebrate → next cornerstones); fires after the cut this skill prepares |
| `/pull-request` | every iteration leaf ships through it (lint anchors, cross-family routing) |
