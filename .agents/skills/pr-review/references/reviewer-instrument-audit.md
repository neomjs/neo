# Reviewer-Instrument Audit

Two failure shapes that every other review dimension is blind to, because both produce **green code and confidently-worded findings**. Premise, placement, correctness and evidence all check the *patch*; these check the **instrument** — the gate the patch relies on, and the search the reviewer relies on.

Load this when the diff adds a capability gate, constant guard, feature flag, or a new field/config leaf; or when a review is about to assert that something is absent.

---

## Shape 1 — a gate that checks a capability EXISTS rather than that it RAN

The question no dimension asks:

> **Does satisfying this gate cause anything to happen, or does it merely describe something?**

A gate written as `typeof PRODUCER !== 'function'` is satisfied by `() => {}`. A gate written as a shape check over a caller-supplied object is satisfied by a correctly-shaped object. In both cases the guard passes, the tests pass, and the thing the guard exists to guarantee never happened. **Type-checking a producer is not invoking it.** Validating a receipt's shape is not obtaining the receipt.

Applied to a diff, in order of how often each has bitten:

1. **Is the guarded thing ever invoked?** Follow the gate to the code behind it. If the gate opens and nothing runs, the gate is decoration.
2. **Who owns the observation?** If the value the gate protects arrives as a *caller argument*, the caller can assert it. The honest shape is: the consumer invokes the producer and owns what it observes.
3. **For a newly declared field or config leaf — does a WRITER exist in production code?** A field that is declared, read, and tested still does nothing if only a spec ever assigns it. A test that hand-injects the value witnesses the pass-through and reads as evidence of wiring; it is evidence of the read path only.

### The converse, which is equally a defect

> **If I am about to claim nothing invokes this — have I found the real caller?**

A reviewer asserting a gate is forgeable is making an absence claim, and it is subject to Shape 2 below. The honest caller may be one layer above the module under review, in a wrapper the module's own error text names.

---

## Shape 2 — an absence claim from a search with no positive control

> **"No caller." "Nothing references it." "Not used anywhere."**

Every one of these is a claim about what a *command* returned, not about what exists. An empty result has two explanations — the thing is absent, or the search could not have found it — and they are indistinguishable from the output alone.

Two rules, both cheap:

1. **Carry a positive control that shares the target's blind spot.** The same command must also find something you know is present — and the control must traverse **every stage capable of excluding the target**: the same matcher, the same ref, the same path scope, the same downstream filters. A control that survives a stage the target dies at proves nothing.

   This is the rule's own Shape-1 trap, and it is easy to write the weak version. "A control exists" is a *declaration*; "a control runs the failing path" is an *execution*. Worked counterexample — names the reviewed SHA, carries a known-present control, and still publishes a false absence:

   ```sh
   git grep -n -E '<target>|name: pr-review' <sha> -- .agents/skills/pr-review \
     | grep -v 'reviewer-instrument-audit.md'
   ```

   The generic control (`name: pr-review`) survives the `grep -v`; the target does not. Both rules as naively written are satisfied — control present, SHA stated — while the finding is false. Where one control cannot cover every stage, place a control **at each** failure-prone stage.
2. **State the tree.** A review asserting an absence must name the **branch or SHA** it searched. A local checkout is not the PR; `git grep` on `dev` cannot see a branch's code, and it exits 0 with empty output while doing so.

### Worked failure

`git grep <name>` run against a **local checkout still on `dev`**, proving an absence against a tree that structurally could not contain the branch's code. `git grep` exits 0 with empty output while doing it, so the result is indistinguishable from a genuine absence.

A stage-matched control kills it instantly: the control is missing too, because the wrong tree contains neither.

**A caution the same review earned.** A second reviewer reached the *same* false absence on the same module and published a `grep -v` as the cause. An exact-object probe at the cited head later showed the filter did **not** remove the proving line — so the finding was false but the stated mechanism was never established. Diagnosing your own broken search is itself a claim, and it is subject to this section: an unverified account of *why* a search failed is not evidence, and it propagates faster than the finding because it sounds like a lesson.

---

## Empirical anchor — four events, one day, three PRs, two reviewers

Each row verified against its exact Git object, not against the review text that reported it. An earlier draft of this table carried five rows and two wrong coordinates, both lifted from peer review prose — which is the failure this file exists to prevent, committed by this file.

| # | event | verified at | shape |
|---|---|---|---|
| 1 | Gate written `typeof PROMOTION_REPLAY_PRODUCER !== 'function'`; a no-op satisfied it (#16037) | `de2b17d614` | 1 |
| 2 | `daemonState` / `daemonDegradedReason` declared and read in production, **assigned nowhere**; the unit spec injects them (#16050, Drop+Supersede) | `c3d28ca76d` | 1 |
| 3 | Reviewer asserted a gate forgeable while the producer *was* invoked one layer up (#16053) | `6f8406178c` | 1-converse |
| 4 | `git grep` over a local checkout still on `dev` — an absence proven against a tree that could not contain the code (#16053) | `6f8406178c` | 2 |

Events 3 and 4 are **reviewer** error rather than author error, and they are the same false conclusion reached independently by two reviewers on one module — which is what moved this from a personal lesson into substrate.

**Why four and not five.** A fifth row claimed a `grep -v` had deleted the proving line. An exact-object probe at the cited head returned that line intact, so the finding was real but its published cause was not. A false finding plus a *claimed* explanation is **one event**, not two; counting the explanation separately would have inflated the ledger with the very kind of unverified account the rest of this file rejects.

---

## Why the asymmetry makes these worth a slot

A detection failure announces itself: something escapes and someone eventually notices. A **permission** failure announces nothing — the gate opens, the suite is green, and the green then reads as evidence the thing was checked and approved. Same for an absence claim: a wrong finding is loud and gets retracted, while a wrong *exemption* is silent forever.

Both shapes here sit on the silent side. That is the entire argument for a checklist entry rather than reviewer memory: the failure mode produces no signal to remember it by.

---

## Net-load accounting

Per `AGENTS.md §self_evolving_systems`, substrate additions state their cost.

- **Always-loaded cost:** `SKILL.md` 1673 → 2068 bytes, **+395**, measured not estimated. The Map gains a pointer, not a rule.
- **Conditional cost:** this file, loaded only when a review meets the trigger — a gate/flag/field in the diff, or an absence claim in the review.
- **Justification:** four exact-object-verified events in one day across three PRs and two reviewers, independently flagged `[TOOLING_GAP]` by both with the same wording. The slot is justified by recurrence, not by novelty.
- **Retirement trigger:** if a mechanical check ever lands that fails a review body asserting an absence without a named tree/SHA, the Shape-2 half retires into that check and this file shrinks to Shape 1 alone.
