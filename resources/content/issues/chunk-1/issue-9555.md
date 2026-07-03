---
id: 9555
title: 'Feature: Implementation of Data-Worker Side Caching'
state: OPEN
labels:
  - enhancement
  - help wanted
  - no auto close
  - ai
  - performance
  - core
  - not-code-ready
  - needs-design
assignees: []
createdAt: '2026-03-25T20:28:46Z'
updatedAt: '2026-06-23T03:28:21Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9555'
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
# Feature: Implementation of Data-Worker Side Caching

### Goal
Implement an intelligent caching layer within the Data Worker to reduce redundant network requests.

### Description
By caching shaped data results inside the Data Worker, we can significantly improve TTI for repeated views.

**Requirements:**
1. Add a `cache: boolean` configuration to `Neo.data.Pipeline`.
2. Implement a key-value cache in the Data Worker using a hash of the `read()` parameters.
3. Support `TTL` (Time-To-Live) configurations.
4. Provide an API to explicitly clear/invalidate the cache (`pipeline.clearCache()`).

## Timeline

- 2026-03-25T20:28:46Z @tobiu assigned to @tobiu
- 2026-03-25T20:28:48Z @tobiu added the `enhancement` label
- 2026-03-25T20:28:48Z @tobiu added the `ai` label
- 2026-03-25T20:28:48Z @tobiu added the `performance` label
- 2026-03-25T20:28:48Z @tobiu added the `core` label
- 2026-03-25T20:50:28Z @tobiu added the `help wanted` label
- 2026-03-25T20:50:28Z @tobiu added the `no auto close` label
- 2026-03-26T15:20:03Z @tobiu unassigned from @tobiu
- 2026-06-23T03:28:08Z @neo-gpt added the `not-code-ready` label
- 2026-06-23T03:28:08Z @neo-gpt added the `needs-design` label
### @neo-gpt - 2026-06-23T03:28:20Z

[ARCH_ALIGNMENT]

Ticket-intake verdict: **needs-design / not code-ready**, but preserve open.

Evidence checked on 2026-06-23:

- #9555 is open, unassigned, and parked with `no auto close`; the current issue age is past the normal stale+close window, so the exemption means this needs full successor/current-source validation before any code pickup.
- Live issue body proposes a new `Neo.data.Pipeline` public contract: `cache: boolean`, Data Worker key-value cache keyed from `read()` params, TTL configuration, and `pipeline.clearCache()`.
- Live duplicate/successor sweep found no direct implementation or duplicate. `ask_knowledge_base` also reports no successor implementation for this exact Data Worker / Pipeline cache / TTL / clearCache feature.
- Current source confirms the feature is not already present: `src/data/Pipeline.mjs` has the App Worker proxy / Data Worker counterpart path and `read(params)` retry logic, but no cache config, no TTL semantics, and no clear/invalidate API. `src/worker/Data.mjs` only hosts remote instance/module loading. Existing Service Worker cache APIs are a different asset/offline cache domain, not shaped Data Worker pipeline caching.
- The ticket modifies a consumed framework API/config surface. Per the contract-ledger readiness gate, branch work should not start until the ticket names the exact cache contract: cache key canonicalization, whether cached value is raw/parsed/normalized shaped output, TTL units/defaults/expiry behavior, invalidation scope across app/data worker instances, interaction with push/stream connections, and test/measurement criteria.

I added `not-code-ready` + `needs-design` so this leaves the claimable implementation queue while staying open as a parked design lane. Re-entry condition: update the ticket with a current contract ledger and measurement plan for repeated `read()` calls under `workerExecution: 'data'`.

- 2026-06-23T03:33:42Z @neo-gpt cross-referenced by #9554

