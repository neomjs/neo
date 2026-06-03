# Tier-2 Revalidation Sweep — Operator Runbook

`@summary` Operator runbook for invoking the Tier-2 revalidation sweep mechanism (Epic #11796 AC6 / sub #11803) when a benched `AgentIdentity` family reactivates.

## When to invoke

After updating `ai/graph/identityRoots.mjs` to flip a family's `participationStatus` from `operator_benched` or `temporarily_unreachable` → `active`, run this sweep to identify Tier-2 graduated substrate (Issues, Epics, PRs) that landed during the bench window with the now-reactivated family named in their `## Unresolved Liveness` section.

The sweep posts a notification comment on each matched artifact inviting the reactivated family to post a retroactive `[GRADUATION_APPROVED]` / `[GRADUATION_DEFERRED]` / `[GRADUATION_ABSTAIN]` signal. The reconciliation work itself is human/peer-judgment-driven — the sweep is the discoverability surface, not the resolver.

Same-family sibling activation does not create a new family reactivation window when another identity in that family was already active. If an operator supplies an explicit `--since` for a multi-active family, the sweep fan-outs the notification to every active same-family identity in one comment; the family still counts once per §6.4 same-family aggregation.

## Mechanism (Option c sweep-script-notifies-only)

Per Discussion #11793 OQ5 / sub #11803:

- **(a)** Retroactive-signal posting by convention only → rejected as too weak (substrate enforces nothing).
- **(b)** Automated substrate re-open → rejected as too strong (churn risk).
- **(c)** Sweep-script-notifies-only → **adopted**. Substrate provides a loud-but-non-destructive notification surface; the reactivated family then engages via normal peer-review discipline.

## Invocation

### 1. Dry-run (recommended first pass)

```bash
npm run ai:revalidation-sweep -- --family gemini --dry-run
```

The dry-run prints the list of matching artifact numbers + titles + the notification body that *would* be posted. No GitHub mutations occur. Use this to sanity-check coverage before applying.

### 2. Apply (post notifications)

```bash
npm run ai:revalidation-sweep -- --family gemini --apply
```

Posts a notification comment on each matched artifact.

### 3. Custom window

```bash
npm run ai:revalidation-sweep -- --family gemini \
    --since 2026-05-18T00:00:00.000Z \
    --until 2026-06-15T00:00:00.000Z \
    --apply
```

When `--since` is omitted, it falls back to `IDENTITIES[family].properties.since` in `ai/graph/identityRoots.mjs`. When `--until` is omitted, it defaults to "now".

## What gets matched

A graduated Issue / Epic / PR matches when **both**:

1. It was created within the `[since, until]` window.
2. Its body contains a `## Unresolved Liveness` section whose text names the reactivated family in backticks (e.g., `` `gemini`: participationStatus operator_benched ``).

The match is anchored to the `## Unresolved Liveness` section to avoid false positives from `## Signal Ledger` rows where the family already provided `APPROVED` / `DEFERRED` / `ABSTAIN`.

## Reconciliation (peer-owned, post-notification)

When the reactivated family responds to the notification:

- `[GRADUATION_APPROVED]` → the artifact's `## Unresolved Liveness` entry transitions to **resolved-by-retroactive-signal**; the `revalidationTrigger` AC closes.
- `[GRADUATION_DEFERRED]` → reconciliation cycle re-opens substantive concerns; standard `peer-role` substrate applies (`audits/consensus-mandate.md §quorum-rule` non-author family hierarchy).
- `[GRADUATION_ABSTAIN]` → entry transitions to **resolved-by-abstain**; the `revalidationTrigger` AC closes.
- No-signal-on-the-notification = liveness-failure, never consent (`ideation-sandbox-workflow.md §6.2(b)`). Re-poll or escalate to peer-owned disposition per §6.5.

## MVP scope boundaries

The mechanism is intentionally narrow per ticket #11803:

- **One family at a time.** Multi-family revalidation is out-of-scope; invoke the sweep per family if multiple reactivations land together.
- **Family-keyed fan-out.** Multi-active same-family identities are notification targets, not separate quorum units. One sweep comment names all active same-family identities; the family-of-record signal follows §6.4 same-family aggregation.
- **Manual invocation.** No automated `participationStatus`-watcher daemon. The operator invokes this script when flipping a family's status; future automation is a separate Discussion if friction materializes.
- **No auto-reconciliation.** Matched artifacts' `## Unresolved Liveness` entries are NOT auto-rewritten; the reactivated family edits them as part of posting their retroactive signal.
- **1000-candidate ceiling.** `gh search issues` is invoked with `--limit 1000` (the GitHub search API's hard max). For bench windows producing >1000 candidate Issues/PRs, run the sweep in narrower `--since`/`--until` segments and union the results. The body-match filter brings the result-set down sharply (e.g., a 100-candidate window typically narrows to 1-3 Tier-2 matches), so the ceiling rarely binds in practice.

## Related substrate

| Substrate | Role |
|---|---|
| Epic [#11796](https://github.com/neomjs/neo/issues/11796) | Active-peer quorum for high-blast graduation consensus (parent epic) |
| Sub [#11803](https://github.com/neomjs/neo/issues/11803) | This mechanism's implementation ticket |
| Discussion [#11793 OQ5](https://github.com/neomjs/neo/discussions/11793) | Deferred-with-timeline that produced this mechanism |
| `ai/graph/identityRoots.mjs` | `participationStatus` + `since` + `reactivationTrigger` source-of-truth |
| `ai/scripts/revalidationSweep.mjs` | Implementation |
| `.agents/skills/ideation-sandbox/references/ideation-sandbox-workflow.md` §6.5 | Discipline + invocation reference |
| `.agents/skills/ideation-sandbox/audits/consensus-mandate.md` §quorum-rule | Tier-2 rule background |
