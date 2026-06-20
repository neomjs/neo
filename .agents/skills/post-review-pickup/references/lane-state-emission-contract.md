# Lane-State Emission Contract — the Stop-hook machine seam

The turn-terminal `lane-state:` prose line ([post-review-pickup-workflow.md §2.5](./post-review-pickup-workflow.md))
is the **human-readable** form. The **machine seam** the `laneStateStopHook`
(`§no_hold_state`, #13623) validates is a fenced ` ```lane-state ` code block
carrying the descriptor as JSON. Emit **both**: the prose line for humans, the
block for the machine.

## When + where to emit

Emit the block as the **last** ` ```lane-state ` block of your turn-terminal
message — `parseLaneState` is global, so the last block wins (an earlier
illustrative block never overrides your real terminal). Every turn-terminal
carries exactly one.

Without it, `parseLaneState` returns `null` → the hook records `no lane-state
block emitted at turn-terminal` → it **blocks the turn** when
`NEO_LANE_STATE_ENFORCE=1` (dry-run logs `WOULD-BLOCK` instead). A
present-but-malformed-JSON block also blocks. So once enforcement is on, the
block is not optional.

## Descriptor schema

```lane-state
{"wakeDisposition":"actionable","laneContinuation":"next-lane","namedGates":[],"awaitingOwnPrOnly":false}
```

| Field | Values / meaning |
|---|---|
| `wakeDisposition` | `actionable` \| `awareness` \| `stale` \| `suppressed` \| `incident` — how you engaged the wake. A wake-disposition **alone is not a terminal**: a `laneContinuation` is always required (Rule 1). |
| `laneContinuation` | **Required.** `active-lane` \| `next-lane` \| `blocker-routed` — all three are DRIVING continuations. There is no hold state (`§no_hold_state`); the survey-idle `verified-no-lane` was retired (#13627). |
| `namedGates[]` | The PR/issue gates this terminal cites: `{ref, checkedAt, mergeClaim?, field?}`. Each gate MUST cite a same-turn `checkedAt` — a stale gate name is not evidence. A gate flagged `mergeClaim: true` MUST cite `field: "mergedAt"`; a PR's `state`/`CLOSED` is not merge proof (Rule 3). |
| `awaitingOwnPrOnly` | `true` only when the sole cited lane is an own PR awaiting merge/review/CI — which resolves to `next-lane`, never `active-lane` (Rule 2). |

## Worked examples

Plain next-lane (no gates) — the common case:

```lane-state
{"wakeDisposition":"actionable","laneContinuation":"next-lane","namedGates":[],"awaitingOwnPrOnly":false}
```

Citing a merge gate (note `field: "mergedAt"` and the same-turn `checkedAt`):

```lane-state
{"wakeDisposition":"actionable","laneContinuation":"next-lane","namedGates":[{"ref":"#1234","checkedAt":"2026-06-20T16:50:00Z","mergeClaim":true,"field":"mergedAt"}],"awaitingOwnPrOnly":false}
```

## Why a block, not just the prose line

The validator's Rule 3 needs the per-gate `checkedAt` / `mergedAt`-field evidence
as **structured data the prose line cannot carry**. The prose line stays for
humans; the block is the externally-falsifiable machine record. Source of truth:
`ai/scripts/lifecycle/parseLaneState.mjs` (parser) +
`ai/scripts/lifecycle/validateLaneStateTerminal.mjs` (rules). This contract is
the **input side** of the `§no_hold_state` Stop-hook (#13623 / #13643): enabling
`NEO_LANE_STATE_ENFORCE=1` before agents emit the block would block every
prose-only turn (the swarm-trap this contract prevents).
