---
id: 8152
title: Combine DomAccess.addScript and loadScript into a unified API
state: CLOSED
labels:
  - enhancement
  - no auto close
  - ai
  - refactoring
  - architecture
assignees:
  - neo-opus-ada
createdAt: '2025-12-21T11:37:41Z'
updatedAt: '2026-08-10T20:06:38Z'
githubUrl: 'https://github.com/neomjs/neo/issues/8152'
author: tobiu
commentsCount: 3
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
closedAt: '2026-08-10T20:06:38Z'
---
# Combine DomAccess.addScript and loadScript into a unified API

`DomAccess.addScript()` and `DomAccess.loadScript()` currently provide similar functionality but with different implementations and use cases.

`addScript` is exposed as a remote method, while `loadScript` is a local helper used by addons.

We should merge these into a single, robust API that:
1.  Supports both remote and local usage.
2.  Handles both adding the tag and tracking loading state (Promise-based).
3.  Standardizes the configuration object.

This is a technical debt cleanup task.

## Timeline

- 2025-12-21T11:37:42Z @tobiu added the `enhancement` label
- 2025-12-21T11:37:42Z @tobiu added the `ai` label
- 2025-12-21T11:37:43Z @tobiu added the `refactoring` label
- 2025-12-21T11:37:43Z @tobiu added the `architecture` label
- 2025-12-21T11:46:03Z @tobiu cross-referenced by #8149
### @github-actions - 2026-03-22T03:55:57Z

This issue is stale because it has been open for 90 days with no activity.

- 2026-03-22T03:55:58Z @github-actions added the `stale` label
- 2026-03-28T05:55:52Z @tobiu removed the `stale` label
- 2026-03-28T05:55:52Z @tobiu added the `no auto close` label
### @neo-opus-ada - 2026-06-21T10:33:46Z

## Premise V-B-A (before unifying)

`addScript(data)` (`DomAccess.mjs:182`, **remote-method-exposed** at :64 — a worker-boundary API; takes a data-object, appends a `<script>`) and `loadScript(src, opts={defer:true})` (:540 — takes a src + opts, returns a promise) have **different signatures and use-cases**: `addScript` = a worker-driven script-append (a cross-worker contract); `loadScript` = an addon's async-load (**19 consumers**: CesiumJS / AmCharts / GoogleMaps / MapboxGL / …).

So "unify" is not a blind merge — it needs a design-decision:
- **(a) one method with a mode-flag** — risks conflating the two use-cases AND breaks the remote-method contract + the 19 `loadScript` call-sites (a breaking API-change).
- **(b) a shared internal helper both public methods delegate to** — keeps both public APIs (preserves the remote-contract + the 19 consumers) and DRYs the actual script-tag creation. Bounded, non-breaking.

Recommend **(b)**: the genuine duplication is the script-element creation, not the public surface. That makes this a bounded internal-DRY lane (no consumer churn, no Contract Ledger needed beyond the internal helper), vs (a)'s breaking change. Flagging the unify-shape before any refactor — the "does this make sense?" check on a stale (2024) ticket so it isn't picked up as a blind public-API merge. — Ada


- 2026-06-21T10:33:47Z @neo-opus-ada assigned to @neo-opus-ada
- 2026-06-21T10:40:07Z @neo-opus-ada cross-referenced by PR #13752
- 2026-06-21T18:05:01Z @neo-opus-ada cross-referenced by #13797
- 2026-06-21T18:10:41Z @tobiu referenced in commit `62a5438` - "refactor(main): DRY DomAccess script-element creation via createAndAppendElement (#8152) (#13752)

Co-authored-by: tobiu <tobiasuhlig78@gmail.com>"
### @neo-opus-ada - 2026-08-10T20:06:37Z

## Resolved in substance — closing, with the unmet part named rather than dropped

Re-verified against current `dev` rather than from the ticket's framing.

**The unification landed.** Both entry points now construct through one primitive:

- `addScript(data)` → `createAndAppendElement('script', data)` (`src/main/DomAccess.mjs:192`)
- `loadScript(src, opts)` → `createAndAppendElement('script', {...opts, onerror, onload, src})` (`src/main/DomAccess.mjs:686`)
- `createAndAppendElement(tag, props)` (`:204`) — *"The common primitive behind addScript() and loadScript()"*, in its own JSDoc.

Against the three stated goals: **(1) one implementation** — met, both share the primitive. **(2) promise-based load tracking** — met, `loadScript` returns a Promise wired to `onload`/`onerror`. **(3) standardized construction** — met, `Object.assign` onto the element in one place.

**What is NOT done, and should not be:** merging the two *public signatures* into a single API. My own premise V-B-A on this ticket (2026-06-21) established why, and it still holds — `addScript` is **remote-method-exposed** (`:64`), a worker-boundary API taking a data object; `loadScript` is a local helper taking `(src, opts)` and returning a Promise. Collapsing them would either force a Promise across the worker boundary or strip `loadScript`'s return value. **Two call shapes with different boundary semantics sharing one implementation is the correct end state**, and it is the state the code is in.

So the technical-debt half is paid and the API-merge half is a premise I am retiring rather than leaving open as implied future work. `loadStylesheet()` adopting the same primitive stays available as opportunistic cleanup, noted in the primitive's own JSDoc — not tracked here.

Closing as completed.

— @neo-opus-ada ⚖️


- 2026-08-10T20:06:38Z @neo-opus-ada closed this issue

