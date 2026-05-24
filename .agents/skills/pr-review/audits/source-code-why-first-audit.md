# Source-Code Why-First Sub-Audit (Reviewer-Side Enforcement)

Reviewer-side enforcement primitive for the source-code documentation intent contract (primary codification: `learn/agentos/AGENTS_ATLAS.md §source_code_documentation_intent_contract`; ticket #11890 graduated from Discussion #11889 cycle-3 on 2026-05-24).

Sub-shape of `pr-review-guide.md §7.4 Rhetorical-Drift Audit` — sibling to the main framing-audit task, focused on comment ANCHORS (snapshot artifact vs durable surface) instead of comment FRAMING.

## When This Audit Fires

Required when the PR adds or modifies source-code comments / JSDoc inside `src/`, `ai/`, `apps/`, `test/`, or any other JavaScript / TypeScript module surface. Mark N/A for docs-only changes (`learn/`, `*.md`), config-only changes, generated files (`apps/**/sitemap.xml`, build output), or PRs that don't touch comments.

## Why the Sub-Audit Exists

Source-code comments and JSDoc decay differently from PR-body / commit / Discussion archaeology because source evolves under living architecture, while snapshot artifacts persist tied to their cycle. A ticket reference inside code can be meaningless within a month; a line range almost certainly shifts on the next edit. PR bodies, commit messages, ticket bodies, and Discussion comments are explicitly carved out — archaeology IS the value there because those artifacts are graph-ingestion substrate.

## Default Rule

Source-code comments and JSDoc default to NO ticket / PR / lane / AC / cycle / line-number anchors. The promotion path: if historical context is still needed to maintain the code, promote the decision to a durable authority surface (ADR, AGENTS rule, AGENTS_ATLAS, learn doc, owning-primitive docs) FIRST, then cite the promoted surface or a stable code symbol — never the original snapshot.

## Six Operational Tests

Apply at write-time (author) and review-time (reviewer):

1. **Snapshot test** — Is the anchor tied to a ticket, PR, lane, AC, cycle, or line range? If yes → archaeology; does not belong in source-code by default.
2. **Promotion test** — If the historical decision is still needed to maintain the code, has it been promoted to a durable authority surface (ADR / AGENTS / AGENTS_ATLAS / learn doc / owning-primitive docs) before being cited?
3. **Symbol test** — Can the comment cite a stable symbol (`Base#ready()`, `SwarmHeartbeatService#pulse()`) or canonical doc instead of a line number or ticket?
4. **Consumer-boundary test** — Is the comment explaining a generic Neo/framework pattern (`initAsync()` semantics, dotenv loading, lifecycle hooks) in a consumer? Owning primitive docs carry generic-pattern explanations; consumers document only their local boundary or exception.
5. **Removal test** — If this anchor were removed, would a future maintainer be unable to make a correct change? No → archaeology; yes → load-bearing (still prefer the promoted authority surface per Promotion test).
6. **Contract test** — Is the anchored artifact the current contract (ADR / AGENTS rule / KB doc / stable symbol) or only the implementation diary (Discussion thread, PR cycle log, lane name)? Contract may stay; diary must move out of source.

## Test-Description Carve-Out

`test.describe(...)` / `test(...)` / `it(...)` titles MAY cite ticket / AC identifiers when the test is the AC-verification artifact for that ticket — the citation anchors test-as-contract. Comments INSIDE test bodies follow the strict source-code rule. No broad lane / cycle / PR archaeology in titles unless the test is explicitly verifying that substrate.

## Required Action Template

> *"Source-code archaeology detected: `[file:line context]` cites `[ticket / PR / lane / cycle / line range]` which does not pass the [Snapshot / Promotion / Symbol / Consumer-boundary] test. Promote the decision to ADR / AGENTS_ATLAS / learn doc / owning-primitive docs and cite that surface, OR cite a stable code symbol, OR remove the archaeology per Removal test."*

## Diagnostic-First Command

Reviewers and authors can surface candidate archaeology markers (non-failing report; CI hard-fail deferred until false-positive rate is proven low):

```bash
# Run against PR diff scope or specific paths — expect false positives at authority anchors
rg -n "cycle-[0-9]|Lane [AB]|nightshift|per #[0-9]{4,5}|\.mjs:[0-9]+" <paths> -t js
```

Each match requires manual review against the six tests — legitimate ADR / AGENTS anchors will pass; snapshot archaeology will fail. Authority-anchor false positives are the expected case, not the rule violation.

## Authority Placement

The full rule body lives in this audit file (loaded only when this sub-audit fires) + a compact pointer in `learn/agentos/AGENTS_ATLAS.md §source_code_documentation_intent_contract` for architectural-sweep discoverability. `AGENTS.md` is deliberately avoided — keeps the rule out of always-loaded turn substrate per `§substrate_accretion_defense`.

## Anti-Pattern Reference

Surfaced in `pr-review-guide.md §7.7` anti-pattern table:

> Approval of source-code comments / JSDoc carrying ticket / PR / lane / cycle / line-number anchors that fail the Snapshot / Promotion / Symbol / Consumer-boundary tests
