# Seat Evidence Capabilities

Per-seat, time-stamped records of which evidence classes each maintainer seat's host can
produce — the routing input for visual, headed-harness, and native-matrix verification work.

**Authority boundary:** these are *observations*, never traits. Per ADR 0032 §2.3.3,
capability/model/family facts live on time-scoped eras, never flat on durable `AgentIdentity`.
This document is the documented-convention interim; the queryable form migrates to the
IdentityState / Fleet-registry line (#11318 / #13015) when that substrate lands. The vocabulary
and state enum below are chosen so the records migrate without translation.

## Evidence-class vocabulary

| Class | Meaning |
|---|---|
| `visual-render` | Headed/headless real-browser renders, golden comparisons, screenshot censuses (per-platform goldens — CI produces none by design) |
| `headed-electron` | Headed Electron harness witnesses (app boot, lifecycle receipts) |
| `headed-native-browser` | Native headed-browser matrix receipts (QT portability matrix cells) |
| `ci-virtual-display` | CI / virtual-display runs — **explicitly not** native-placement evidence; never promoted to the classes above |

## State enum

| State | Meaning |
|---|---|
| `positive` | Verified producer — a receipt exists for this class on this seat's host |
| `negative` | Known ceiling — a recorded incident shows this class failing on this host |
| `unknown` | Unmeasured, or the last observation is past its revalidation trigger |

## Record shape

Each record carries: `state` · `observedAt` (ISO date) · environment grain (host OS, harness,
GPU-relevant notes) · receipt/incident link · `revalidationTrigger`.

**Freshness rule:** a record past its `revalidationTrigger`, or made after any host/harness
change on that seat, renders as `unknown` until re-run. Stale is never stale-positive.

**Write authority:** each seat writes its OWN record (self-observation + receipts). The operator
may override any record. Peers may attach a counter-receipt (a fresh re-run of the same class)
but never overwrite another seat's record.

A peer may transcribe a replacement into another seat's record only when **every named seat whose
disposition changes** supplies or endorses the bearer receipt and records durable assent. Without
that assent the peer may attach the counter-receipt but must not change `State`. This resolves an
ambiguity present since the record's founding (#15592 prescribed both "never overwrite" *and* "the
seat itself or any peer re-running the class with a fresh receipt flips the record", without saying
who may write the flip) — a grouped, multi-seat block makes the two rules collide, and one member
cannot license a rewrite on behalf of the others.

**A block header must name only canonical seats.** A stale alias makes the assent rule
unsatisfiable, because no one can assent for a seat that does not exist.

## Advisory consumers

These flows SHOULD consult this document before routing evidence-class work. The records are
**advisory only**: they inform a peer's choice — they never type an identity, never assign
unilaterally, and never block a seat from attempting a class (a `negative` record is an
expectation, not a ban; counter-receipts are how ceilings retire).

- `pr-review` — visual-evidence seat selection for UI PRs
- `whitebox-e2e` — headed journey / harness witness routing
- QT portability matrix assignment (#15243 line) — native headed-browser cells

## Seat records

### @neo-kimi-phoebe / @neo-kimi-iris (shared macOS host)

| Class | State | Observed | Grain | Receipt | Revalidation |
|---|---|---|---|---|---|
| `visual-render` | positive | 2026-07-19 | macOS, Apple Silicon, real Chrome | AgentCard censuses + golden comparisons (#15538/#15547 review evidence) | host change or 30d |
| `headed-electron` | positive | 2026-07-19 | macOS, Electron harness | #15566 AC9 witness: `smoke:brain` zero leaks, `witness:lifecycle` passed | host change or 30d |
| `headed-native-browser` | positive | 2026-07-19 | macOS, headed Chrome | QT matrix rows 4/5/7 PASS (#15552, #15589) | host change or 30d |
| `ci-virtual-display` | positive | 2026-07-20 | GitHub Actions ubuntu | routine CI green | n/a |

### @neo-gpt / @neo-gpt-emmy (shared macOS host)

| Class | State | Observed | Grain | Receipt | Revalidation |
|---|---|---|---|---|---|
| `visual-render` | positive | 2026-08-23 | macOS, **headless** branded Chrome, and only under **explicit out-of-sandbox execution approval**. Under the default Codex command sandbox, browser subprocesses cannot register the required Mach services: branded Chrome aborts `SIGABRT`, bundled Chromium `SIGTRAP` — the latter naming the denied primitive, `bootstrap_check_in … MachPortRendezvousServer: Permission denied (1100)`. The July `ApplicationServices` symptom was real; its cause is a permission boundary, not a pending host fix | **@neo-gpt** — boundary matrix + `FleetCatchUpNL` 1/1 and two minimal Playwright projects 2/2 in 896ms: [#17595 comment 5383917794](https://github.com/neomjs/neo/issues/17595#issuecomment-5383917794). **@neo-gpt-emmy** — `FleetCockpitDrillNL` **1/1 in 3.0s** at tree `cf88381ba6`, from a minimal pair varying only the execution boundary (`--headed` absent from **both** arms), establishing permission rather than launch mode as causal: [#17605 bearer receipt 5384401126](https://github.com/neomjs/neo/issues/17605#issuecomment-5384401126) (underlying record `MESSAGE:6635c77d-60b8-4de5-9fd4-55998ed79c06`). Both bearers state in-line that this is `visual-render` evidence only | loss of out-of-sandbox approval, host change, or 30d |
| `headed-electron` | negative | 2026-07-19 | macOS, `ApplicationServices` registration failure class | #15566 AC9 witness could not produce on this host | **a fresh headed-Electron run on this seat** — the 2026-08-23 browser receipts do not transfer: no Electron ran, and no browser result can retire a headed-Electron ceiling |
| `headed-native-browser` | unknown | — | unmeasured for this class. The 2026-08-23 receipts are **headless** runs (`--headed` was absent from both arms of the controlling experiment), so they are `visual-render` evidence and cannot promote a headed-only class | — | a headed-native run on this seat |
| `ci-virtual-display` | positive | 2026-07-20 | GitHub Actions ubuntu | routine CI green | n/a |

### @neo-opus-* (Claude-family seats; shared macOS host — same machine as the Kimi/GPT seats, separate checkouts)

| Class | State | Observed | Grain | Receipt | Revalidation |
|---|---|---|---|---|---|
| `visual-render` | positive | 2026-08-23 | macOS, **headless** Playwright branded Chrome — host scope. The 2026-07-18 record asked for a host run before generalizing beyond its harness observation; this is that run. `toHaveScreenshot` comparisons executed and produced golden drift rather than failing to render. **The harness-scoped negative stands unchanged**: the in-app browser pane still wedges (300s, AgentCard design evidence) and is not a render surface — route render work through Playwright, never the pane | `test/playwright/e2e/agentos` directory census, 62 tests (45 passed / 17 failed), plus targeted 3/3, 2/2 and 1/1 runs the same night — [#17596](https://github.com/neomjs/neo/issues/17596), PR [#17599](https://github.com/neomjs/neo/pull/17599), PR [#17600](https://github.com/neomjs/neo/pull/17600#pullrequestreview-5001650864), PR [#17603](https://github.com/neomjs/neo/pull/17603#pullrequestreview-5001644295) | harness change or 30d |
| `headed-electron` | unknown | — | unmeasured | — | — |
| `headed-native-browser` | unknown | — | unmeasured | — | — |
| `ci-virtual-display` | positive | 2026-07-20 | GitHub Actions ubuntu | routine CI green | n/a |

### @neo-fable-* / @neo-gemini-pro

All classes `unknown` — unmeasured (Fable seats rate-limited until the Friday reset; Gemini seat
benched). First measurement welcome: run any class and attach the receipt.

## Founding incident log

1. **2026-07-18/19 — render ceiling (two hosts).** Grace's in-app browser wedged (300s) on the
   AgentCard census; the GPT host's `ApplicationServices` failure aborted headless Chrome. All
   render evidence that week came from the Kimi host.
2. **2026-07-19 — harness ceiling.** #15566's AC9 headed-Electron witness could not be produced
   on the GPT host; the Kimi host ran it clean. Discovered mid-review, not planned — the routing
   blindness this document exists to retire.
3. **2026-07-19 — matrix concentration.** Every headed QT matrix receipt (rows 4/5/7) ran on the
   Kimi host; Windows/Linux cells remain unmeasured for lack of real desktops elsewhere.

## Fallback rule

When no seat is `positive` for a required class: the work **parks honestly** (the QT matrix's
existing pattern) — the evidence requirement is recorded as an explicit residual, never silently
substituted. `ci-virtual-display` output is never promoted to native/headed evidence. The
requesting peer escalates to the operator for the hardware/VM decision, and the class carries a
revalidation trigger for the next capable host.

**When the AUTHOR's seat cannot produce a class another seat can**, the work does not park — it
hands off, and the handoff is a contract with two halves:

1. **The author declares the gap explicitly**, in the PR body, naming what did not execute and
   refusing to infer a product verdict from it. *"The launch aborted before a browser object
   existed; no assertion ran, so this says nothing about the specs"* is the shape. A green CI run
   is not a substitute, because CI does not execute every class — E2E is local-only by design.
2. **A capable reviewer reruns that class** and reports the result as review evidence.

Both halves are load-bearing. On 2026-08-23 two PRs shipped with their E2E layer unexecuted; both
authors declared it honestly, a reviewer reran, and one deterministic regression surfaced that
neither CI nor the authors could have seen. The declaration is what tells a reviewer *which*
experiment to run — an author who rounds the gap up to "probably fine" removes the only signal
that the layer needs a second seat at all.

A seat whose block below is stale counts as `unknown`, not as `negative`: consult `observedAt`
before routing, and prefer producing a counter-receipt over inheriting a ceiling.

## Migration path

When the IdentityState era substrate (#11318) or the Fleet registry (#13015) lands a capability
surface, these records move verbatim: same classes, same states, `observedAt` becomes the era
boundary. This document then retires to a pointer.
