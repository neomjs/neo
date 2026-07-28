# Correction Culture

> No-blame is not softness; it is what keeps the correct fix reachable.

Blame and improvement reach for different fixes. Framed as personal failure, the available remedy
is *be more careful* — and that remedy is exhausted by construction: ADR 0019, the project's own
read-gate, exists because "be more careful" was falsified 4/4 on a config review by a reviewer who
had read the docs. Framed as structural, the remedies become mechanisms — grep the identifier before
committing, run it rather than re-read it, mine the origin session rather than re-derive — and a
mechanism is reproducible by anyone, including a peer with no memory of the incident that
produced it.

## The two-sided sweep

The failure class under a whole day's corrections: **change one side of a contract, do not sweep
the other.** Three instances in one day across three surfaces — a guard's self-test against the
allowlist it pinned, an ADR table cell against the subsection it retired, an intake pre-requisite
against the trigger that replaced it. The mechanical counter: grep the identifier or clause you
are changing **before committing**, not after review.

## Execute it, or mine it

Two moves work on this error class; both are cheap and neither is diligence.

**Execute it.** The load-bearing experiment is *run*, never re-read from a receipt. Verify the
citation; RUN the inference. The tell for which is which: an inference is anything downstream of
"therefore", "so", "which means", "hence" in your own draft — grep the connective before
submitting. A citation you checked is a fact; a connective you wrote is a hypothesis.

**Bound it.** Before writing `FALSIFIED`, state what the instrument can decide and confirm every
claim is inside that set; give multi-clause gaps separate verdicts. A narrow negative cannot
overturn a direct observation outside its set. A correction toward *not real*, *not ours*, or
*smaller than stated* gets one independent check before publication: direction is a trigger, not
evidence of error. Retire this prose when a mechanical claim-scope gate enforces the same boundary.

**Mine it.** Tickets and PRs carry an `Origin Session ID`, and the session is the *intent
authority*: a PR can be faithful to its own body while retreating from its filing session's
conclusion. The review's premise is intent-vs-diff, not claims-vs-diff. Trigger: mine when the PR
claims to change / retire / amend / supersede / correct a prior position (free when the field is
absent). Counter-instrument warning: semantic search's miss is silent — "nothing found" can mean
"nothing there" or "the noise floor answered instead" (session-init boilerplate is
indistinguishable from a thorough empty result). The session id is the direct route, not
`query_raw_memories` over guessed terms.

## The tell registry

Tells are **personal**, not team — each bearer keeps their own, because they do not transfer. The
team-shareable practice is keeping a registry at all: a named tell travels better than a
resolution. First rows of the practice:

- *"I ship proxies as rules."* — pre-flight: what is this a proxy FOR, and where does it come
  apart? (Grace, 2026-07-25)
- *"Superlative opening ↔ shallowest verification."* — enthusiasm in the opening correlates with
  un-reproduced evidence. (Iris, 2026-07-25)
- *"Change one side of a contract, forget the sweep."* — the class both rows above sit in; the
  two-sided sweep is the counter.

## How a correction lands (for the corrector)

- **Give a technique, not a verdict** — enablement makes the peer independently better instead of
  dependent on the next catch.
- **Carry the honest bound with the fix** — the limitation travels with the change, so the next
  reader meets it.
- **Audit yourself harder than your accuser** — a correction that finds more than was alleged is
  the one that sticks.
- **Freshness cuts both ways** — a stale signal can be pessimistic as well as optimistic;
  doubting a peer's fresh approval is a real cost, not a safe default.

## The record

Live instances from the day this was written (2026-07-25): Memory Core session
`26e73986-66fa-4d28-9b02-6053541a5671` (the frame's first writing — entry `7477d669`); the #15896
cycle-1→2 arc (a rubber-stamp review → one cheap experiment →
a falsified ADR rule, dropped by its own author); #15898 (an intake pre-requisite deadlocked
against a new trigger); #15909 (a session-scoped wake poll's silent death and its 16-entry
backlog). The pattern each time: the fix that worked was a mechanism, not a promise.

— Co-authored by Grace (Claude Opus 5, Claude Code) and Iris (Kimi K3, Kimi Code CLI), from a
peer brainstorm neither could have had alone. 🖖🌈
