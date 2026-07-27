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

1. **Carry a positive control.** The same command must also search for something you know is present. If the control does not appear, the instrument is broken and the empty result means nothing. This catches the entire class in one step: a filter eating its own matches, a wrong path scope, a wrong ref, a typo'd pattern.
2. **State the tree.** A review asserting an absence must name the **branch or SHA** it searched. A local checkout is not the PR; `git grep` on `dev` cannot see a branch's code, and it exits 0 with empty output while doing so.

### Worked failures

Both of these searched for a real caller that was present the whole time:

- `git grep <name> -- <paths> | grep -v "<module>.mjs"` — the filter's own pattern matched the **dynamic-import path**, deleting the one line that proved the caller existed.
- `git grep <name>` run against a local checkout still on `dev`, proving an absence against a tree that structurally could not contain the branch's code.

A positive control kills both instantly: the first shows the control disappearing along with the caller, the second shows the control missing from the wrong tree.

---

## Empirical anchor — five instances, one day, two reviewers

Measured, not imagined. All resolved; cited so a future reader can see the shape recur rather than take it on assertion.

| # | instance | shape |
|---|---|---|
| 1 | `SEAT_ADAPTER_PRODUCER` gated on `typeof !== 'function'`; a no-op satisfied it (#16037) | 1 |
| 2 | Cockpit field declared, read and tested with **no writer**; the spec hand-injected it (#16050, Drop+Supersede) | 1 |
| 3 | Reviewer asserted a gate forgeable while the producer *was* invoked one layer up (#16053) | 1-converse |
| 4 | `grep -v "<module>.mjs"` deleted the dynamic-import line proving the caller (#16053) | 2 |
| 5 | `git grep` over a local checkout on `dev`, wrong tree entirely (#16053) | 2 |

Instances 3–5 are all **reviewer** error, not author error. Two of them were the same false claim reached by two different broken searches, by two different reviewers, on the same module — which is what moved this from a personal lesson into substrate.

---

## Why the asymmetry makes these worth a slot

A detection failure announces itself: something escapes and someone eventually notices. A **permission** failure announces nothing — the gate opens, the suite is green, and the green then reads as evidence the thing was checked and approved. Same for an absence claim: a wrong finding is loud and gets retracted, while a wrong *exemption* is silent forever.

Both shapes here sit on the silent side. That is the entire argument for a checklist entry rather than reviewer memory: the failure mode produces no signal to remember it by.

---

## Net-load accounting

Per `AGENTS.md §self_evolving_systems`, substrate additions state their cost.

- **Always-loaded cost:** one trigger line in `SKILL.md` (~200 bytes). The Map gains a pointer, not a rule.
- **Conditional cost:** this file, loaded only when a review meets the trigger — a gate/flag/field in the diff, or an absence claim in the review.
- **Justification:** five instances in one day across three PRs and two reviewers, independently flagged `[TOOLING_GAP]` by both with the same wording. The slot is justified by recurrence, not by novelty.
- **Retirement trigger:** if a mechanical check ever lands that fails a review body asserting an absence without a named tree/SHA, the Shape-2 half retires into that check and this file shrinks to Shape 1 alone.
