---
id: 9553
title: 'Feature: Implement Pipeline Interceptor System (Middleware)'
state: OPEN
labels:
  - enhancement
  - help wanted
  - no auto close
  - ai
  - architecture
  - core
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2026-03-25T20:10:19Z'
updatedAt: '2026-06-23T03:35:40Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9553'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# Feature: Implement Pipeline Interceptor System (Middleware)

### Goal
Implement a middleware/interceptor system for `Neo.data.Pipeline` to allow cross-cutting concerns to be handled declaratively.

### Description
As the Data Pipeline architecture matures, we need a way to inject logic at key stages of the data lifecycle (pre-request, post-response, post-parse).

**Requirements:**
1. Support `request` interceptors (e.g., adding Auth headers, logging params).
2. Support `response` interceptors (e.g., global error handling, refreshing tokens).
3. Interceptors must support `async` execution.
4. Allow global interceptors to be registered at the `Neo.worker.Data` level.
5. Pipelines should allow instance-specific interceptors that merge with globals.

## Timeline

- 2026-03-25T20:10:19Z @tobiu assigned to @tobiu
- 2026-03-25T20:10:20Z @tobiu added the `enhancement` label
- 2026-03-25T20:10:20Z @tobiu added the `ai` label
- 2026-03-25T20:10:20Z @tobiu added the `architecture` label
- 2026-03-25T20:10:21Z @tobiu added the `core` label
- 2026-03-25T20:51:06Z @tobiu added the `help wanted` label
- 2026-03-25T20:51:06Z @tobiu added the `no auto close` label
- 2026-03-26T15:19:45Z @tobiu unassigned from @tobiu
- 2026-06-23T03:33:42Z @neo-gpt cross-referenced by #9554
- 2026-06-23T03:35:23Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:35:23Z @neo-gpt added the `needs-design` label
### @neo-gpt - 2026-06-23T03:35:40Z

[ARCH_ALIGNMENT]

Ticket-intake classification on 2026-06-23: **needs-design / not-code-ready**; preserve open, but exclude from branch pickup until the interceptor contract is explicit.

Evidence checked:
- Live issue state: #9553 was created on 2026-03-25, last updated on 2026-03-26, has no comments, no assignee, and already carries `no auto close`.
- Stale-band: `.github/workflows/close-inactive-issues.yml` sets issue stale at 90 days and close 14 days later. At 2026-06-23T03:35:14Z, #9553 is still **pre-stale by updatedAt** (~88.5 days), not post-stale; `no auto close` is a parked-lane signal, not readiness evidence.
- KB ticket sweep found #9553 as the active Pipeline interceptor item and did not identify a direct successor or duplicate. Raw Memory Core queries for #9553 / Pipeline middleware did not surface a prior design resolution.
- Live issue/PR sweeps found no merged PR completing this ticket. Search hits such as #12986, #2995, and the PR results are not a Data Pipeline interceptor implementation.
- Current source check: `src/data/Pipeline.mjs` exposes the connection -> parser -> normalizer flow plus Data Worker proxying; there is no interceptor chain, no global registry merge, and no stage hook execution. `src/worker/Data.mjs` exposes `createInstance`, `loadDataModule`, and `loadModule`, but no global interceptor registration API. The only exact `interceptor` source hit is `src/worker/ServiceBase.mjs#onFetch()`, a Service Worker network-request handler, not a `Neo.data.Pipeline` middleware surface.

Reason for not-code-ready: this ticket would introduce a consumed architecture surface across App Worker, Data Worker, `Neo.data.Pipeline`, connection/parser/normalizer stages, and likely Store behavior. That needs a Contract Ledger before code. Minimum design decisions:

| Target Surface | Required design decision |
|---|---|
| `Neo.data.Pipeline` config/API | Exact config shape for instance interceptors, stage names, ordering, async semantics, mutation vs return-value semantics, and failure behavior. |
| `Neo.worker.Data` global registry | Registration API, lifetime, teardown, tenant/app isolation, and compatibility with Data Worker module-loading constraints. |
| Global + instance merge | Deterministic ordering, deduplication/identity, opt-out/override behavior, and whether globals run before or after instance hooks. |
| Stage boundaries | Exact request/response/post-parse points for `read()`, `execute()`, create/update paths, streaming parser events, push events, and normalizer output. |
| Worker boundary | Serialized payload/return contract for `workerExecution: 'data'` and behavior when interceptors are not transferable functions. |
| Evidence | Focused tests for app execution, data-worker execution, async ordering, error propagation, and backward compatibility for existing `Store.load()` consumers. |

Applied labels: `not-code-ready` + `needs-design`.


