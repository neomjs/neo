# Fleet Manager Public-Fleet First-Paint Rate Budget — 2026-07-18

Issue: #15524 · Epic: #15519 · Source: D#15498 OQ6/OQ7 · Measured:
2026-07-18T23:06:05Z

This is the graduated public-fleet falsifier, not a new acquisition design. It asks whether Fleet
Manager can point the existing synced community-activity readers at `neomjs/neo` on first paint
without credentials and stay inside GitHub's anonymous budget. The bundled deterministic sample
remains the shipped default and performs zero provider calls.

## Verdict

**FAIL — the existing-reader public-fleet tier must be token-gated.**

The zero-credential path fails on provider capability before request volume becomes the limiting
factor:

- anonymous REST exposes a 60-request/hour core bucket and the public issue, issue-comment, and
  review-comment collections answered successfully;
- the GraphQL resource reported limit `0` and an unauthenticated probe failed with HTTP 403;
- the collaborator census required by the existing reader failed with HTTP 401; and
- the existing plan uses GraphQL for issue and pull-request roots, review pages, Discussion roots,
  comments, and replies.

The 60-request REST bucket cannot substitute for those unavailable source families. Per the
graduated D#15498 disposition, the public-fleet read-only backend therefore remains an explicit
token-present opt-in. The offline sample remains the honest zero-credential first paint.

## Existing-reader contract

The measured plan is not hypothetical:

- `ai/services/github-workflow/communityActivityShadowReader.mjs` owns GET-only REST/GraphQL
  acquisition and records every REST call, GraphQL call, cost, gap, and latency.
- `ai/scripts/maintenance/probeCommunityActivityShadow.mjs` binds that reader to the authenticated
  GitHub transport and explicitly describes the transport as authenticated.
- The [community-activity shadow measurement](https://github.com/neomjs/neo-agent-brain/blob/dev/learn/agentos/measurements/community-activity-shadow-2026-07-18.md) records one complete
  authenticated 30-day acquisition at 1,714 provider requests/cost units: 1,683 GraphQL and 31
  REST. That full-history shape is evidence about the reader, not an acceptable first-paint plan.

## Live zero-credential receipt

Every request removed both `GH_TOKEN` and `GITHUB_TOKEN` from the process environment and used the
same public repository coordinates. No mutation endpoint was called.

| Probe | HTTP | Provider receipt | Meaning |
|---|---:|---|---|
| `GET /rate_limit` | 200 | core limit 60; GraphQL limit 0 | Anonymous REST exists; anonymous GraphQL does not |
| `GET /repos/neomjs/neo/issues?state=all&per_page=1` | 200 | core bucket | Public issue roots are REST-readable |
| `GET /repos/neomjs/neo/issues/comments?per_page=1` | 200 | core bucket | Public issue/PR comments are REST-readable |
| `GET /repos/neomjs/neo/pulls/comments?per_page=1` | 200 | core bucket | Public review comments are REST-readable |
| `GET /repos/neomjs/neo/collaborators?affiliation=all&per_page=1` | 401 | `Requires authentication` | The reader's trust census is unavailable anonymously |
| `POST /graphql` with a read-only repository query | 403 | GraphQL limit 0 | Roots/reviews/Discussions cannot run anonymously |

The observed remaining-core counters are deliberately not used as a product threshold: anonymous
rate buckets are shared by network identity and change as unrelated callers consume them. The
stable evidence is the provider-declared limit and each endpoint's capability result.

## First-paint authority

| Mode | Provider calls on default first paint | Authority |
|---|---:|---|
| bundled sample | 0 | shipped zero-credential default, explicitly labeled sample |
| public fleet without token | 0 | unavailable; do not offer a dead or partial opt-in |
| public fleet with token | explicit opt-in only | existing reader may acquire live public activity through the authenticated read boundary |

An intentionally degraded REST-only preview would be a different query plan with different family
coverage and trust semantics. It must not be presented as the existing synced-reader public fleet,
and this measurement does not authorize it.

## Reproduction

The capability probes are ordinary unauthenticated `curl` requests with a public User-Agent and
token variables removed. Re-run them when GitHub changes anonymous GraphQL or collaborator access,
when the community-activity query plan changes, or before proposing zero-credential public fleet
again. A changed result reopens the verdict; elapsed time alone does not.

## Consequence for #15524

The implementation branch does not need a second unauthenticated acquisition stack. It needs:

1. the explicit bundled-sample first-run authority and honest transition to selected/live data;
2. a token-present public-fleet opt-in through the existing read-observe boundary; and
3. the packaged cold-first-run witness after #15543, #15544, and #15545 land.

The org-adjacency mechanism remains recorded in ADR 0037: even token-gated public-fleet provenance
is native to the adjacent `neomjs/neo` source, while an unbound brand/org split severs it.
