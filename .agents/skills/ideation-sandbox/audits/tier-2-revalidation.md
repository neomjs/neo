# Tier-2 Revalidation Sweep — Audit Reference

*(Substrate extracted from `../references/ideation-sandbox-workflow.md §6.5` per #11319 / #11320 per-file byte-budget discipline. Load this file when you need the full Tier-2 Revalidation Sweep mechanism description, invocation, reconciliation semantics, or MVP scope boundaries. The main `../references/ideation-sandbox-workflow.md §6.5` carries the operational rule with an inline pointer to this audit.)*

## §mechanism — Tier-2 Revalidation Sweep (Option c sweep-script-notifies-only)

Per Epic #11796 AC6 + sub #11803, Tier-2 substrate changes graduated under a benched-family liveness gap carry an `## Unresolved Liveness` entry + `revalidationTrigger` AC. When the benched family reactivates (`participationStatus` flips `operator_benched` / `temporarily_unreachable` → `active` in `ai/graph/identityRoots.mjs`), the sweep identifies the affected artifacts and posts a notification inviting retroactive signal review.

The mechanism is **Option (c) sweep-script-notifies-only**:
- **(a)** Retroactive-signal posting by convention only → rejected as too weak (substrate enforces nothing).
- **(b)** Automated substrate re-open → rejected as too strong (churn risk).
- **(c)** Sweep-script-notifies-only → **adopted**. Substrate provides a loud-but-non-destructive notification surface; the reactivated family then engages via normal peer-review discipline.

Same-family sibling activation does not create a new family reactivation window when another identity in that family was already active. If an operator supplies an explicit `--since` for a multi-active family, the sweep fan-outs the notification to every active same-family identity in one comment; the family still counts once per §6.4 same-family aggregation.

## §invocation — CLI Invocation

```bash
# Dry-run (recommended first pass)
npm run ai:revalidation-sweep -- --family <name> --dry-run

# Apply (post notifications)
npm run ai:revalidation-sweep -- --family <name> --apply

# Custom window
npm run ai:revalidation-sweep -- --family <name> \
    --since 2026-05-18T00:00:00.000Z \
    --until 2026-06-15T00:00:00.000Z \
    --apply
```

When `--since` is omitted, it falls back to `IDENTITIES[family].properties.since` in `ai/graph/identityRoots.mjs`. When `--until` is omitted, it defaults to "now".

## §match-shape — What Gets Matched

A graduated Issue / Epic / PR matches when **both**:

1. It was created within the `[since, until]` window.
2. Its body contains a `## Unresolved Liveness` section whose text names the reactivated family in backticks (e.g., `` `gemini`: participationStatus operator_benched ``).

The match is anchored to the `## Unresolved Liveness` section to avoid false positives from `## Signal Ledger` rows where the family already provided `APPROVED` / `DEFERRED` / `ABSTAIN`.

## §reconciliation — Peer-Owned Post-Notification Path

When the reactivated family responds to the notification:

- `[GRADUATION_APPROVED]` → the artifact's `## Unresolved Liveness` entry transitions to **resolved-by-retroactive-signal**; the `revalidationTrigger` AC closes.
- `[GRADUATION_DEFERRED]` → reconciliation cycle re-opens substantive concerns; standard `peer-role` substrate applies (`audits/consensus-mandate.md §quorum-rule` non-author family hierarchy).
- `[GRADUATION_ABSTAIN]` → entry transitions to **resolved-by-abstain**; the `revalidationTrigger` AC closes.
- No-signal-on-the-notification = liveness-failure, never consent (`ideation-sandbox-workflow.md §6.2(b)`). Re-poll or escalate to peer-owned disposition per §6.5.

## §scope-boundaries — MVP Scope (per ticket #11803)

The mechanism is intentionally narrow:

- **One family at a time.** Multi-family revalidation is out-of-scope; invoke the sweep per family if multiple reactivations land together.
- **Family-keyed fan-out.** Multi-active same-family identities are notification targets, not separate quorum units. One sweep comment names all active same-family identities; the family-of-record signal follows §6.4 same-family aggregation.
- **Manual invocation.** No automated `participationStatus`-watcher daemon. The operator invokes this script when flipping a family's status; future automation = separate Discussion if friction materializes.
- **No auto-reconciliation.** Matched artifacts' `## Unresolved Liveness` entries are NOT auto-rewritten; the reactivated family edits them as part of posting their retroactive signal.
- **1000-candidate ceiling.** `gh search issues` is invoked with `--limit 1000` (GitHub search API hard max). For bench windows producing >1000 candidate Issues/PRs, run the sweep in narrower `--since`/`--until` segments and union the results.

## §related — Related Substrate

| Substrate | Role |
|---|---|
| Epic [#11796](https://github.com/neomjs/neo/issues/11796) | Active-peer quorum for high-blast graduation consensus (parent epic) |
| Sub [#11803](https://github.com/neomjs/neo/issues/11803) | This mechanism's implementation ticket |
| Discussion [#11793 OQ5](https://github.com/neomjs/neo/discussions/11793) | Deferred-with-timeline that produced this mechanism |
| `ai/graph/identityRoots.mjs` | `participationStatus` + `since` + `reactivationTrigger` source-of-truth |
| `ai/scripts/revalidationSweep.mjs` | Implementation |
| `learn/agentos/tooling/Tier2RevalidationSweep.md` | Operator runbook (when-to-invoke, mechanism, invocation, MVP scope boundaries) |
| `.agents/skills/ideation-sandbox/audits/consensus-mandate.md` §quorum-rule | Tier-2 rule background |

## §empirical-anchor — Dogfooded Match

First dry-run against the gemini bench window 2026-05-18 → 2026-05-23:

```json
{ "candidates": 100, "matches": 1, "results": [{ "number": 11796, "title": "Active-peer quorum for high-blast graduation consensus", "action": "DRY_RUN_WOULD_NOTIFY" }] }
```

The mechanism correctly identifies **Epic #11796 — its own parent epic — as the Tier-2 substrate needing Gemini revalidation when Gemini reactivates**. Depth-3 recursive validation: the rule about Tier-2 substrate under benched-family liveness (Epic #11796) → the mechanism that implements the rule's revalidation (sub #11803, this audit's substrate) → the mechanism correctly finds the parent epic that ships the rule.
