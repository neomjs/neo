# Community-Activity Shadow Measurement — 2026-07-18

Issue: #15149 · Epic: #15145 · Generated: 2026-07-18T17:59:08.405Z

This is a read-only, 30-day lower-bound measurement of supported GitHub issue,
pull-request/review, and Discussion source occurrences. It is evidence, not community
authority: the run admitted no events, advanced no checkpoints, created no Tasks, projected no
counts, delivered no wakes, and selected no operational threshold.

## Run Coordinates

- Command: `npm run ai:probe-community-activity-shadow -- --owner neomjs --repo neo --window-start 2026-06-18T00:00:00Z --window-end 2026-07-18T00:00:00Z --page-size 100 --runs 2 --output .neo-ai-data/community-activity-shadow/report-2026-07-18-v2.json`
- Repository: `neomjs/neo`
- Window: `[2026-06-18T00:00:00.000Z, 2026-07-18T00:00:00.000Z)`
- Report schema: `community-activity-shadow-report.v1`
- Report ID: `79a6d84d9212d00f0f9ca8db33d517c64f0f90bfd0d2ef68fee88103bcc770dd`
- Query-plan hash: `a8b8463178384ab810b7deee43ff1319ab9c419d3fc2df495b57023913925910`
- Raw report: `.neo-ai-data/community-activity-shadow/report-2026-07-18-v2.json` (ignored local evidence, 1,058,632 bytes)
- Raw-report SHA-256: `7ff1e6be32b2b9840290408332685f3c985e26533daaec63ba7431c2a917a887`
- Wall time: `1,040,936 ms` across two complete acquisitions

## Aggregate Snapshot

| Measure | Value | Evidence status |
|---|---:|---|
| Source occurrences | 11,253 | lower-bound window |
| Attention-eligible external occurrences | 22 | zero-authority projection input |
| Attention-eligible density | 0.1955% | measured ratio, not a policy threshold |
| Provider pages | 1,739 | measured per full acquisition |
| Provider requests / cost units | 1,714 / 1,714 | 1,683 GraphQL + 31 REST; cost is a lower bound |
| Projected metadata | 3,809,537 bytes | lower-bound projection |
| Revisions | 2,937 | lower-bound observed revisions |
| Explicit tombstones | 0 | lower bound; absence is not a tombstone |
| Duplicate occurrences | 0 | measured inside the declared acquisition plan |

## Family Breakdown

| Family | Pages | Occurrences | Unique entities | Attention-eligible | Revisions | State transitions | Projected bytes | Provider latency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Issues | 40 | 4,920 | 2,756 | 9 | 1,460 | 951 | 1,640,121 | 21,288 ms |
| Pull requests / reviews | 995 | 5,664 | 3,493 | 4 | 1,364 | 863 | 1,939,843 | 320,606 ms |
| Discussions | 704 | 669 | 543 | 9 | 113 | 38 | 229,573 | 191,005 ms |

The acquisition shape is not uniform. Pull requests/reviews consume the most pages and elapsed
provider time in absolute terms. Discussions consume `1.0523` pages per candidate versus `0.1757`
for pull requests and `0.0081` for issues, so Discussion child traversal is the densest provider-read
surface per observed candidate in this run. This is a measurement input only; it does not authorize
a pagination cap or cadence.

## Repeatability

Both acquisitions used the same query-plan hash and produced the same order-independent candidate
manifest:

`65de1150163ec730630abf4538012ab2ec1070b04441f81fb9b92137992ee38c`

Every reported numeric variance was zero: pages, provider requests/cost, raw and candidate rows,
duplicates, revisions, tombstones, projected bytes, and attention-eligible rows.

The receipt-level source-manifest hashes were intentionally recorded separately:

- Run 1: `33088e5dba0e33b04e004cc17fa130bee34a3aa3e7f73ead0ad5b6bdc7608347`
- Run 2: `b42736c6663bfcee205397b911ebc50414eb5e5833aaff8afb94c8bb8952cf60`

They differ because `sourceManifestHash` includes latency-bearing page receipts as well as family
inventory hashes. The stable candidate-manifest hash is the content-identity witness; the distinct
source-manifest hashes preserve the two actual acquisition receipts instead of erasing run-specific
transport evidence.

## Coverage Posture

- The declared family plans exhausted successfully and the run was not degraded.
- This is still a lower bound and makes no global-completeness claim.
- Issue and pull-request lifecycle timelines were not acquired.
- Historical comment/review revisions may be missing.
- Historical deletion tombstones are unavailable; zero explicit tombstones does not mean zero
  deletions.
- Pull-request root search has day granularity.
- Discussion comments/replies use a child-watermark lower bound.
- Popularity telemetry (stars, forks, watches, and equivalents) was excluded by contract and did not
  enter candidate, storage, count, or wake inputs.

## Unknowns and Non-Decisions

Useful-response latency and production-lifecycle metrics remain explicitly unknown, including CAS
conflict rate, duplicate-batch receipt rate, replay lag, outbox age, bytes/hooks/wakes per admitted
event, steward vacancy, false-positive rate, and time to acknowledge/claim/respond.

The report leaves acquisition cadence, pagination cap, retention, archive threshold, TTL, steward
lease, and wake threshold as `null`. The observed 0.1955% attention-eligible density and provider-cost
shape are inputs for later admission/attention decisions; they are not authorization to activate a
count, hook, wake, Task, or policy surface.
