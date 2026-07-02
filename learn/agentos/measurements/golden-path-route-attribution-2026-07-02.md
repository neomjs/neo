# Golden Path Route Attribution Measurement - 2026-07-02

Issue: #14454

## Run

- Command: `npm run test-unit -- test/playwright/unit/ai/services/graph/GoldenPathSynthesizer.spec.mjs -g "#14454"`
- Result: `1 passed`
- Capture timestamp in run: `2026-07-02 08:40 UTC`
- Cycle surface: `GoldenPathSynthesizer.synthesizeGoldenPath({repoEnrichmentEnabled: false})`

This measurement records the first same-run route-attribution ledger emitted by the
Computed Golden Path synthesis path. The run is intentionally hermetic: vector search,
summary input, open PR fetch, and the strategic brief provider are stubbed inside the
unit test so the ledger values are reproducible.

## Config Snapshot

- Semantic candidate pool: `nResults: 20`
- Semantic type gate: Chroma `where: {type: {'$in': ['ISSUE', 'DISCUSSION']}}`
- Frontier source: two most-recent summary documents via `getRecentSummaryDocuments`; this run stubs the summary text as `Golden Path route attribution focus`
- Semantic weight: `2.0`
- Structural weight: `1.0`
- Rendered top-node limit: `goldenPathTopNodeRenderLimit` default `10`
- Repo enrichment: disabled for the verification run, so Current Focus / Silent Threads / PR state cannot alter the route
- New graph schema: none; the ledger mints no graph nodes and no new edge classes

## Same-Run Ledger Snapshot

The test run creates three semantic candidates in one pass:

| Candidate | Semantic | State | Type | Actionability | Blocker | Structural total | Structural components | Final | Route | GUIDES write | Rendered |
|---|---:|---|---|---|---|---:|---|---:|---|---:|---|
| `issue-route-ledger-ready-*` | 5.00 | OPEN | passed (ISSUE) | passed | passed | 3.50 | ADVANCES: 1.50, RESOLVES: 2.00 | 13.50 | rendered | 13.50 | Score 13.50 / Semantic 5.00 / Structural 3.50 |
| `issue-route-ledger-not-ready-*` | 3.33 | OPEN | passed (ISSUE) | rejected (not-code-ready) | passed | 0.00 | - | - | non-actionable | - | - |
| `issue-route-ledger-blocked-*` | 2.50 | OPEN | passed (ISSUE) | not-evaluated | blocked (`issue-route-ledger-blocker-*`) | 0.00 | - | - | blocked | - | - |

## Acceptance Fork

The run satisfies the non-zero structural fork: at least one rendered top item has
`Structural: 3.50`, and the ledger names the contributing edge types in the same pass.
The zero-structural case is therefore not confirmed as a dead-write / cold-start defect
by this reproducible scenario.

## Ordering Disposition

The handoff now renders `## Golden Path Route Attribution Ledger` before
`## Computed Golden Path (Strategic Recommendation)`, while the ledger itself is built
inside the same synthesis pass:

1. Semantic candidates are recorded immediately after vector query.
2. SQLite OPEN/type, blocker, label/actionability, and structural components are recorded
   during the scoring loop.
3. `frontier -GUIDES-> candidate` is written before the row records the GUIDES write and
   rendered component values.
4. The final handoff file is written after the GUIDES write and ledger render complete.

That means the diagnostic no longer depends on a later snapshot probe to explain the route.
