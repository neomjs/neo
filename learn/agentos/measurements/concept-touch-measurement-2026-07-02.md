# Concept-Touch Measurement: Re-Derivation Slice 1

Issue: #14506 · Epic: #14472 · Generated: 2026-07-02T22:50:00.000Z

Diagnostics-only measurement. This is not a capability ranking, not a leaderboard, and not
a merge gate. Metrics normalize by each agent's own eligible concept-touch history.

Coverage bound: ~2 of 5 substrate-effect pressure classes mechanically catchable in slice 1

Privacy/provenance note: current substrate has no `privacyTier` field. Aggregation uses
RLS visibility (`userId`, `sharedEntity`, `visibility`) plus most-restrictive trust-tier
provenance. Elements with no resolvable visibility boundary are excluded, never defaulted
into a public/team aggregate.

## Measurement Counts

| Field | Count |
|---|---:|
| TAGGED_CONCEPT edges scanned | 162 |
| Eligible concept-touch events | 137 |
| Eligible events with session id | 0 |
| Excluded events (missing endpoint/timestamp/tier) | 25 |
| Retrieval events applied (slice-2 input) | 0 |

## Per-Agent Concept-Touch Profiles

| Agent | Touches | Concepts | Avg depth | Revisit count | Normalized revisit rate | Visibility mix | Trust mix |
|---|---:|---:|---:|---:|---:|---|---|
| @neo-fable | 6 | 3 | 1 | 3 | 0.5 | team:6 | unclassified:6 |
| @neo-fable-clio | 5 | 1 | 1 | 4 | 0.8 | team:5 | unclassified:5 |
| @neo-gpt | 113 | 8 | 1 | 105 | 0.9292 | team:113 | unclassified:113 |
| @neo-opus-ada | 5 | 1 | 1 | 4 | 0.8 | team:5 | unclassified:5 |
| @neo-opus-grace | 3 | 2 | 1 | 1 | 0.3333 | team:3 | unclassified:3 |
| @neo-opus-vega | 5 | 1 | 1 | 4 | 0.8 | team:5 | unclassified:5 |

## Candidate Re-Derivation Events

Total candidates: 121. Showing first 25 by touch chronology.

| Agent | Concept | Previous session | Current session | Confidence | Reason |
|---|---|---|---|---:|---|
| @neo-opus-ada | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-opus-ada | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-opus-ada | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-opus-ada | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | golden-path | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| @neo-gpt | lane-claim | - | - | 0.35 | history-only-missing-session-boundary |
| omitted | 96 additional candidates | - | - | - | see helper output for full list |

## Study Codebook Mapping

| Pressure class | Slice-1 computability | Note |
|---|---|---|
| repeated-concept re-entry | catchable | Same agent revisits a concept after prior memory exists. |
| retrieval miss before re-entry | partially catchable | Inferred until #14504 retrieval events supply the precision leg. |
| stale-state contradiction | not catchable | Belief-revision leaf #14507 owns claim-class conflict surfacing. |
| routing/cold-start bias | not catchable | Ranking-reach leaf #14503 / #14508 own routing disposition. |
| prose/frame drift | not catchable | Requires review/content evidence, not TAGGED_CONCEPT history. |

## Slice-2 Upgrade Path

#14504 retrieval events add `{query, resolvedConcepts, walkContributed}`. Once present,
`detectRederivationCandidates()` suppresses candidates when a matching retrieval event
surfaced the concept before the later touch; confidence rises only for no-retrieval matches.
