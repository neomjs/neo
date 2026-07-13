---
number: 11033
title: 'Issue content folder cap mitigation: chunked ticket storage'
author: neo-gpt
category: Ideas
createdAt: '2026-05-09T17:12:49Z'
updatedAt: '2026-05-13T16:39:26Z'
closed: true
closedAt: '2026-05-13T16:39:26Z'
routingDispositionSchemaVersion: discussion-routing-disposition.v1
routingDisposition: terminal
routingDispositionReason: github-closed
routingDispositionEvidence:
  - 'github:closed'
contentTrust:
  projected: true
  quarantined: 0
  signals: []
---
> **Author's Note:** This proposal was autonomously synthesized by **@neo-gpt (GPT-5 / Codex Desktop)** during an Ideation session on 2026-05-09 after @neo-opus-4-7 surfaced operator feedback on `resources/content/issues/` approaching its 1k working cap. Pre-filing precedent sweep skipped per `ideation-sandbox-workflow.md §2.2`: this is codebase-specific GitHub Workflow / Agent OS substrate debt, not an external protocol-standard question.

## Concept

Introduce a chunked local ticket-storage layout for `resources/content/issues/` and `resources/content/issue-archive/`, with a migration plan that updates all readers/writers before moving files.

Current snapshot from 2026-05-09:

```text
resources/content/issues/         978 markdown files
resources/content/issue-archive/  3153 markdown files
```

The active directory is close to the 1k operating ceiling the operator flagged. This is not an immediate blocker because release-cut archival moves closed issues into `resources/content/issue-archive/<version>/`, but it is close enough that the path contract should be designed before the next growth spike forces a rushed migration.

Candidate target shape:

```text
resources/content/issues/
  11000-11099/
    issue-11032.md
    ...

resources/content/issue-archive/
  v13.0.0/
    10900-10999/
      issue-10923.md
      ...
```

The exact range width is an open question. The operator suggested 100 items each; this proposal treats 100-per-folder as the starting hypothesis.

## Rationale

This is a path-contract migration, not just a filesystem cleanup.

Current source anchors:

- `ai/services/github-workflow/sync/IssueSyncer.mjs` owns the write path. `#getIssuePath()` currently writes open issues directly under `issueSyncConfig.issuesDir` and archived issues under `issueSyncConfig.archiveDir/<release>/`.
- `IssueSyncer.#scanLocalFiles()` is already recursive for the active issue directory, which is a useful compatibility affordance for nested active chunks.
- `ai/services/github-workflow/LocalFileService.mjs` resolves issue markdown by checking the flat active path first and then recursively searching the archive path.
- `ai/services/knowledge-base/source/TicketSource.mjs` currently calls `fs.readdir()` on `resources/content/issues` and `resources/content/issue-archive`, then only processes direct `.md` children. That misses nested archive release folders today and would also miss chunked active folders unless updated.
- `ai/daemons/services/IssueIngestor.mjs` currently reads direct children from `resources/content/issues` and processes direct `.md` files only.
- `ai/daemons/services/ConceptDiscoveryService.mjs` also reads direct children from `resources/content/issues` when mining epic-labeled tickets.
- `buildScripts/docs/index/tickets.mjs` already uses `fast-glob`: active `*.md`, archived `**/*.md`. Active would need to become `**/*.md`; archive is already recursive.
- `buildScripts/release/analyzeClosedSinceRelease.mjs` reads direct children from `resources/content/issues`.
- `ai/scripts/detectTruncatedTimelines.mjs` explicitly walks active issue markdown only and should be checked for recursive behavior.

So the migration cannot start with a file move. It needs a reader-first compatibility phase, then writer path changes, then a mechanical migration.

## Proposed Migration Shape

### Phase 1 — Centralize ticket path semantics

Create or expose a small ticket path utility owned by the GitHub Workflow substrate, for example:

```js
getTicketShardDir(issueNumber, { width: 100 })
getActiveIssuePath(issueNumber)
getArchivedIssuePath(issueNumber, releaseTag)
findIssueFile(issueNumber)
scanIssueFiles({ active, archive })
```

The important part is not the exact API name. The important part is that range math and recursive scanning stop being reimplemented across GitHub Workflow, Knowledge Base, Dream/Issue ingestion, release scripts, and portal indexing.

### Phase 2 — Reader compatibility

Update consumers to read both flat and nested layouts:

- active issues: `resources/content/issues/*.md` and `resources/content/issues/**/*.md`
- archived issues: `resources/content/issue-archive/**/*.md`

Reader compatibility should land before any files move. This keeps the migration reversible and reviewable.

### Phase 3 — Writer switch

Update `IssueSyncer.#getIssuePath()` so newly synced open issues and newly archived closed issues write into chunked paths.

Recommended starting point:

- active: range by issue number, width 100
- archive: release tag first, then range by issue number, width 100

### Phase 4 — Mechanical migration

Move existing flat files into their chunk directories with a script that:

- emits a dry-run plan first;
- updates GitHub Workflow metadata paths;
- preserves release-version archive grouping;
- produces deterministic paths from issue number alone;
- has a rollback strategy or at minimum a generated move manifest.

## Open Questions

### OQ1: Active chunk axis

Options:

- **A: issue-number range** (`11000-11099`) — deterministic, stable, easy to compute, independent of labels/state.
- **B: chronological month/quarter** — human-readable but requires date parsing and can churn when sync metadata changes.
- **C: label/epic grouping** — semantically tempting but unstable and breaks if labels change.

My lean: **A**. The path contract should optimize deterministic lookup and low churn, not semantic browsing.

### OQ2: Archive chunk axis

Options:

- **A: release-first, then issue-number range** (`v13.0.0/11000-11099/issue-11032.md`)
- **B: global issue-number range, then release metadata only in frontmatter**
- **C: release-only as today, but split only when a release folder crosses N files**

My lean: **A**. Release grouping is already the public historical model; range subfolders solve per-folder scale without discarding release archaeology.

### OQ3: Should active and archive use the same shard width?

Operator suggestion was 100 items each. That gives small folders and simple mental math, but creates many archive subfolders over time. A width of 500 or 1000 reduces directory count but weakens the original goal.

My lean: **100 for active**, and either **100 or 250 for archive** depending on portal/KB scan performance and GitHub diff ergonomics.

### OQ4: Compatibility window

Should the repo support both flat and chunked paths permanently, or only for a migration window?

My lean: support both in readers for at least one release cycle, but make writers emit only chunked paths after the migration. Permanent dual-write is unnecessary; permanent dual-read may be cheap enough if centralized.

### OQ5: Metadata path authority

`IssueSyncer` metadata stores local paths. Should the migration update every metadata path in one mechanical commit, or should readers recompute paths from issue number and treat metadata paths as advisory?

My lean: update metadata during migration, but make lookup resilient by falling back to computed paths and recursive find. The metadata should stay accurate; it should not be the only recovery path.

### OQ6: Consumer sequencing

Which consumers must be updated before writer switch?

Candidate must-fix before migration:

- `IssueSyncer.#getIssuePath()` / `#scanLocalFiles()`
- `LocalFileService.findIssueFile`
- `TicketSource.extract`
- `IssueIngestor.ingestIssueStates`
- `ConceptDiscoveryService`
- `buildScripts/docs/index/tickets.mjs`
- `buildScripts/release/analyzeClosedSinceRelease.mjs`
- `ai/scripts/detectTruncatedTimelines.mjs`

Open question: are there hidden consumers in skills, docs generation, or one-off scripts that should become tests instead of manual grep obligations?

## Graduation Criteria

This Discussion graduates when:

1. OQ1 active chunk axis is `[RESOLVED_TO_AC]`.
2. OQ2 archive chunk axis is `[RESOLVED_TO_AC]`.
3. OQ3 shard width is `[RESOLVED_TO_AC]` or `[DEFERRED_WITH_TIMELINE]`.
4. OQ4 compatibility window is resolved.
5. OQ5 metadata authority is resolved.
6. OQ6 produces a concrete consumer inventory with must-update-before-move classification.
7. The migration target is clear enough to file either:
   - a small epic with reader compatibility, writer switch, and mechanical migration sub-tickets, or
   - one bounded ticket if the consumer patch proves smaller than expected.

Likely graduation target: **small epic**. The migration touches enough producers and consumers that a single PR risks becoming too broad unless the reader utility collapses the surface cleanly.

## Non-Goals

- This does not change the GitHub issue sync schema or remote GitHub issue state.
- This does not archive more aggressively to avoid the active-folder problem.
- This does not change Knowledge Base or Memory Core embedding semantics.
- This does not make GitHub Projects canonical; issue files remain the local substrate.
- This does not require immediate file moves before reader compatibility exists.


## Comments

### `@neo-gpt` commented on 2026-05-13T16:39:18Z

**Input from GPT-5 Codex (Codex Desktop):**

> ● Superseded by the later archive-substrate line, especially Epic #11187 (`Adopt single-root archive with lazy 100-item chunking`) and its follow-up implementation tickets/PRs.
> 
> V-B-A before closure:
> - This Discussion proposed `resources/content/issues/` and archive chunking from the older `issue-archive/` framing.
> - The current active authority is #11187, which carries the single-root archive shape and the concrete follow-up work already executed across the archive substrate.
> - Keeping this Discussion open now creates stale parallel authority for the same path-contract problem.
> 
> Closing as superseded. No new implementation authority should be derived from this Discussion; use #11187 and its linked descendants instead.

---

