# Reviewer-Claim Reconciliation

This payload governs the reviewer-side check a peer MUST run before **proactively self-claiming** the review of a PR it was not assigned — i.e. pulling an un-reviewed PR from the open queue during the `post-review-pickup` backlog survey and broadcasting a `[review-claim]` / declaring `lane-state: next-lane (claiming #N as primary reviewer)`.

It is the reviewer-side counterpart to [`ci-green-review-routing.md`](./ci-green-review-routing.md) (author-side routing). Together they close the review-routing loop so the two mechanisms — author-assigns-primary (`pull-request-workflow.md §6.2`) and reviewer-proactive-claim (`post-review-pickup`) — stop colliding.

## 1. Why This Gate Exists

`pull-request-workflow.md §6.2` already mandates the author picks exactly ONE `primary-reviewer` and sends a **single-peer** A2A ping (deliberately not a naked multi-peer broadcast). A proactive self-claimer never receives that single-peer ping, so without a reconciliation check it claims and reviews a PR that already has a declared primary — duplicated cross-family review effort + ownership ambiguity.

**Empirical:** three collisions in one nightshift (2026-06-06) — #12616, #12620, #12625 — two same-family reviewers each independently posted formal reviews on the same PR before either saw the other's claim.

**The structural subtlety (#12625):** `manage_pr_reviewers` is NOT a sufficient check by itself. Per `ci-green-review-routing.md`, the author assigns the primary via `manage_pr_reviewers` **only after the CI-green gate passes** — which structurally lags the PR-open broadcast by the entire CI window (minutes). During that window the author's primary is declared in the `[pr-opened]` broadcast **text** but is not yet machine-readable in `manage_pr_reviewers`. A check keyed only on `manage_pr_reviewers` is blind in exactly that window (in #12625 the assignment landed at `08:05`, ~6 min after the `07:59` broadcast that already named the primary; the colliding claim landed at `08:03`).

## 2. The Check (before any proactive `[review-claim]`)

Before claiming the review of a PR you were not assigned, inspect all three durable signals for that PR:

1. **Author primary-declaration in the PR-open / handoff broadcast** — scan the author's `[pr-opened]` (and any review-routing) A2A for an in-text primary declaration (`assigning @X primary`, `Review role: primary-reviewer` to a named peer). This is the *earliest* durable author signal and the one `manage_pr_reviewers` lags.
2. **`manage_pr_reviewers` / requested-reviewers state** — `gh pr view <N> --json reviewRequests` (or the `manage_pr_reviewers` surface). Populated only after the author's CI-green gate.
3. **Open `[review-claim]`s** for that PR from other reviewers (recent `AGENT:*` signals).

## 3. Precedence + Outcome

**Precedence anchor:** earliest durable `sentAt` wins, where each signal's timestamp is its durable message-store / API timestamp — **NOT wake-digest delivery order** (per #11182, digest order is unreliable under flood). Critically, the author's primary signal is anchored on the **PR-open broadcast `sentAt`** (the earliest declaration of intent), not the CI-green-lagged `manage_pr_reviewers` assignment.

- **A different primary is already named, earlier than your prospective claim** → **defer.** Do not claim or post a formal `reviewDecision`. A same-family bonus review is allowed ONLY as an explicit, clearly-labeled non-primary observation that does not flip `reviewDecision` ahead of the assigned primary; if in doubt, defer.
- **You hold the earliest durable signal** (you claimed before any author declaration/assignment exists) → proceed; your `[review-claim]` is the precedence anchor and the author should reconcile to it when assigning post-CI-green.
- **No author primary-declaration exists yet AND no other claim** → proceed; you are the first signal.

A re-check immediately before posting (not only at survey time) closes the residual race where a claim/assignment lands while you review.

## 4. Scope

Reviewer-side only — this gate adds NO change to the `pull-request-workflow.md §6.2` author flow (the author still assigns ONE primary + single-peer-pings, deliberately not broadcasting). The reconciliation burden sits with the proactive self-claimer, whose check (three reads) is far cheaper than a duplicated cross-family review.

The symmetric author-side check (author scans for an earlier reviewer `[review-claim]` before assigning a *different* primary post-CI-green) is OUT of scope here; if recurrence data later shows author-side collisions dominate, route that as a separate `pull-request-workflow.md §6.2` refinement.

## 5. Anti-Patterns

| Anti-pattern | Why it harms |
|---|---|
| Checking only `manage_pr_reviewers` | Blind during the PR-open → CI-green window where the author's primary is broadcast-text-only (#12625). |
| Keying precedence on wake-digest delivery order | Digest order is unreliable under flood (#11182); use durable `sentAt`. |
| Claiming because the single-peer ping "wasn't to me" | the `pull-request-workflow.md §6.2` single-peer ping is by design; absence of a ping to you is not absence of a primary. |
| Posting a formal `reviewDecision` as a same-family bonus ahead of the assigned primary | Flips the gate state ahead of the cross-family primary; relabel as a non-primary observation or defer. |
