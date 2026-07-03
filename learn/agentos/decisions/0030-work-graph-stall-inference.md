# ADR 0030: Work-Graph Stall Inference

> Architectural Decision Record for the institution's sense of its own motion:
> deterministic `STALL_*` findings over the work graph, the deliberate-defer
> 4-tuple, source-fidelity requirements, and the consumer boundaries for
> handoff, hook, wake, and Fleet Manager actuator surfaces. The detector reports
> lost motion; it never acts by itself.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-07-02 (transitions to Accepted on approved, green PR merge at the human merge gate, per ADR 0005 §2.3). |
| **Author** | @neo-gpt (Euclid, GPT family), grounded in live V-B-A against Discussion #14447, issues #14461/#14462, ADR 0005/0023/0024/0026/0028, `GapInferenceEngine`, `GoldenPathSynthesizer`, and current `origin/dev`. |
| **ADR classification** | `ADR_REQUIRED` — the `STALL_*` finding schema, defer representation, source-fidelity contract, and consumer boundaries are durable multi-consumer contracts used by multiple future tickets. Without this record, future V-B-A would require archaeology across a Discussion, sibling issues, PR bodies, and session memories. |
| **Resolves** | #14461 — *"Author ADR: work-graph stall-inference — finding schema, defer 4-tuple, consumer boundaries"*. |
| **Graduated from** | Discussion #14447 — *"Institutional proprioception — stall-inference over the work graph"*. |
| **Merge-sequences** | #14462 — the deterministic detection implementation leaf is merge-gated until this ADR is Accepted. |
| **Composes (aligned-with)** | ADR 0005 (ADR-at-graduation), ADR 0023 (DreamService map-fidelity + consolidation-liveness), ADR 0024 (Native Edge Graph model), ADR 0026 (actuator safety envelope), ADR 0028 (future temporal/velocity consumers). |
| **Connects to** | #14306 (detection precedent + suppression/TTL shape), #13751 (stop-hook direction consumer), #13448/#13015 (Fleet Manager actuator surface), #14426 (mailbox/read-path integrity canary), #14453 (direction/trajectory sibling). |
| **Anti-anchor for** | raw `updatedAt` as motion; "stall = important" ranking distortion; push-notification pressure on human-owned items; auto-reassignment / auto-ticketing / auto-wake from the detector; alerting owners who cannot receive; unparseable defers treated as stalls. |

---

## 1. Context

Neo already senses code structure through the Knowledge Base and Native Edge
Graph, and it senses priority through the Dream Pipeline and Golden Path. It did
not have a durable contract for sensing whether work itself is moving.

Discussion #14447 supplied the missing subject with a hand-run replay fixture:
5 stalled items, 2 rescued-by-hand items, and 7 true negatives. The true
negatives are as important as the positives: staged work, moving sibling leaves,
motion in linked work, and named exit conditions must not become noisy stalls.

Existing handoff sections such as Stale Assignment Candidates and Silent
Threads prove the substrate already renders work-graph visibility, but they do
not define a reusable finding schema, source-fidelity tier, deliberate-defer
normal form, or consumer boundary. This ADR defines those contracts so #14462
can implement the detector without re-deciding them.

## 2. Decision

### 2.1 Detection home and execution shape

`STALL_*` detection is a deterministic Dream-cycle pass in the
`GapInferenceEngine` family. It runs over structured work-graph metadata and
never uses an LLM in the detect path.

The first consumer is a bounded `sandman_handoff.md` section generated through
the existing `GoldenPathSynthesizer` handoff surface. Other consumers read the
same finding queue as data; they do not re-implement detection.

### 2.2 Finding schema

Every persisted or rendered finding carries this minimum contract:

| Field | Obligation |
|---|---|
| `findingClass` | One `STALL_*` class such as `OWNER_BENCHED_LANE`, `DECISION_STARVED`, `RESOLUTION_PENDING`, or `STALE_DEFER`. |
| `subject` | The issue, PR, Discussion, document marker, epic, or work artifact being evaluated. |
| `motionPredicate` | The per-class predicate whose failure produced the finding. This is human-readable and machine-testable. |
| `presenceSource` | The source class that proved owner/steward presence or absence. |
| `sourceFidelity` | `verified`, `candidate`, or `degraded`, derived from the source stack in §2.8. |
| `observedAt` | When the detector observed the candidate condition. |
| `lastVerifiedAt` | When the finding was last revalidated against its authoritative source. |
| `verificationSource` | The concrete source used for the latest revalidation, such as live GitHub, Memory Core telemetry, hook presence, or a graph record. |
| `deferDisposition` | Normalized deliberate-defer state from §2.4. |
| `firstSeen` / `lastSeen` / `ttlExpiresAt` | Suppression and expiry envelope, inherited from the #14306 precedent and extended with `lastVerifiedAt`. |
| `evidenceRefs` | Bounded source references sufficient to falsify the finding without reading the whole graph. |

Render classes are:

| Render class | Meaning |
|---|---|
| `verified-stall` | The top-N candidate was revalidated against its authoritative source and has no valid deliberate defer. |
| `candidate-stall` | The detector has enough local evidence to suspect a stall, but source fidelity, motion predicate, or defer parsing is incomplete. |
| `source-degraded` | The candidate may be real, but the source itself is not trustworthy enough to treat as verified. |

Consumers receive `verified-stall` items first. `candidate-stall` and
`source-degraded` render in collapsed, bounded lists unless a consumer explicitly
opts into advisory data.

### 2.3 V1 finding classes

The v1 implementation leaf (#14462) is constrained to classes whose motion
predicate is structured enough to be tested deterministically:

| Class | V1 status | Predicate boundary |
|---|---|---|
| `OWNER_BENCHED_LANE` | In scope | Open owned work joined with structured participation state. |
| `DECISION_STARVED` | In scope for PR human-gate only | Open + approved + unmerged PR. Doc-embedded decisions wait for a marker convention. |
| `RESOLUTION_PENDING` | In scope | All known subs closed, parent epic open, owner inactive or unreachable. |
| `STALE_DEFER` | In scope when the defer 4-tuple is parseable | Exit condition satisfied and no class-specific motion since the defer. |
| `RAMP_UNEXECUTED` | Out of v1 | Needs a per-class motion predicate, not timestamp freshness. |
| `UNANSWERED_ASK` | Out of v1 | Requires responder adoption plus the #14426 mailbox integrity canary. |
| `STEWARD_SILENT` | Out of v1 | Needs a structured steward convention; text extraction alone is not authority. |
| Doc-embedded `DECISION_STARVED` | Out of v1 | Needs `DEFERRED-ON:` / decision-marker convention. |

### 2.4 Deliberate-defer normal form

All deliberate defers normalize to:

```text
defer := (anchorArtifact, exitCondition, authority, deferredAt)
```

Adapters translate existing surfaces into that tuple:

| Surface | Adapter |
|---|---|
| Issues | Status labels such as `not-code-ready`, `needs-design`, `deferred-by-design`, or `needs-re-triage`, plus blocker edges where present. |
| Discussions | In-body status markers with named exit conditions. |
| PRs | A structured body line: `Parked-on: #NNNN [OQn] — reason`. |
| Docs | `DEFERRED-ON: <trigger>` marker. |

Fail-safe rule: a defer without a parseable exit condition becomes
`candidate-defer`, never a stall. It renders as bounded defer-hygiene debt.

Derived rule: `STALE_DEFER` is produced when the exit condition is satisfied and
the subject shows no class-specific motion since `deferredAt`.

### 2.5 Motion predicates, not timestamps

`updatedAt` is activity, not motion. It may be evidence, but it is never the
predicate by itself.

Each finding class defines its own predicate. Examples:

| Class | Motion predicate |
|---|---|
| `OWNER_BENCHED_LANE` | Ownership becomes active again, the lane is reassigned, or linked work advances under an active owner. |
| `DECISION_STARVED` (PR human-gate) | PR merges, closes, receives a new required-change state, or loses approval/merge readiness. |
| `RESOLUTION_PENDING` | Parent epic closes, `/epic-resolution` posts a new verdict, or a required sub reopens. |
| `STALE_DEFER` | The defer exits into an active lane, the exit condition is retracted, or the subject receives qualifying motion after exit. |

### 2.6 Persistence and Native Edge Graph model

When findings need cross-run suppression, TTL, or consumer handoff state, they
persist as deterministic `STALL_FINDING` work-telemetry nodes in the Native Edge
Graph. Identity is deterministic over the finding class and subject, with a
defer anchor included when the finding is defer-derived.

`STALL_FINDING` nodes are never LLM-extracted. The implementation leaf must add
a deterministic schema/validator before any writer emits them.

Active `STALL_FINDING` records are not decay/prune eligible. Resolved or expired
records leave the active render set through the §2.2 TTL/suppression contract;
future retention/rollup policy may use ADR 0028 temporal summaries, but this ADR
does not require that implementation.

ADR 0024 §2.2 is amended by this PR so the graph model has a named home for the
node type before #14462 starts writing it.

### 2.7 Consumer boundaries

| Consumer | Boundary |
|---|---|
| Handoff | Spine consumer. Renders verified top-N plus bounded candidate/degraded lists. |
| Stop hook / #13751 | Data-not-admission. The hook may render stall findings as direction/reason content for "claim a high-value lane"; it must not widen admission or no-hold logic. |
| Wake | Receivable owners only. Do not wake benched/unreachable owners; route those as handoff/FM visibility. |
| Fleet Manager / #13448 | Actuator consumer with a team-controlled decide step. Restart/start affordances route through the ADR 0026 lifecycle envelope; detector output alone never acts. |
| Human-owned items | Pull-not-push. Render in handoff/cockpit-style pull surfaces with leverage framing, plain `waitingSince` data, and a one-flag dismiss path. Never wake/A2A-ping/hook-inject a human-owned stall. |

The detector never reassigns work, opens tickets, emits wakes, merges PRs, or
restarts agents. It reports the state and the consumer decides within its own
authority.

### 2.8 Presence-source taxonomy

Presence and source fidelity are additive, not replace-one-source-with-another:

1. Hook / turn-presence beacon where the harness can report it.
2. Memory Core telemetry and wake-subscription route state.
3. GitHub activity and issue/PR state.
4. Participation ledger / declared status.

Higher-fidelity sources upgrade a finding; lower-fidelity sources keep it
candidate or degraded. A cloud deployment lacking hook presence must say so via
`sourceFidelity`; it must not pretend ledger state is equivalent to live turn
presence.

### 2.9 Ranking boundary

A stall is not automatically importance. Stall findings are an advisory axis by
default. Promotion into structural routing is allowed only for non-deferred,
verified stalls whose class explicitly opts into that behavior. Deferred-with-
exit-condition items stay advisory-only.

Golden Path consumers must keep the computed route distinct from visibility and
stall advisory sections, preserving ADR 0023's routing-vs-visibility boundary.

## 3. Rejected alternatives

| Option | Rejection rationale |
|---|---|
| Raw-age thresholding | Recreates false positives; #14447's 16-day ramp example was refreshed by comments while still frozen. |
| Wake-first alerts | Fails on the highest-value class: owners who are benched or unreachable cannot receive the wake. |
| Hook admission coupling | #13751/#14441 is an admission-sensitive surface; stall findings may inform direction, not bypass hook authority. |
| Social convention only | #14447's steward lapse is the counterexample: the convention's owner forgot the convention. |
| Treat unparseable defers as stalls | Punishes intentionality when the detector lacks enough information; `candidate-defer` is the safe failure mode. |
| Auto-actions from findings | Conflates detection with actuation and bypasses ADR 0026 safety. |

## 4. Consequences

### Positive

- Future implementation PRs have one authority target for the schema, defer
  tuple, source-fidelity contract, and consumer boundaries.
- The handoff can direct no-hold/lane-selection pressure toward real lost
  motion instead of forcing agents to manufacture marginal work.
- Active findings become graph-queryable without widening the LLM extractor or
  creating a parallel engine.

### Negative / handoffs

- Per-class motion predicates are more work than a simple age threshold, but
  the threshold shape is already falsified.
- `UNANSWERED_ASK`, `STEWARD_SILENT`, doc-embedded decisions, and
  `RAMP_UNEXECUTED` remain explicitly post-v1 until their structured predicates
  exist.
- Persisted `STALL_FINDING` records add another graph node type; the mitigation
  is deterministic schema ownership plus the ADR 0024 re-review trigger.

## 5. Merge gate

Implementation PRs for #14462 are merge-blocked until this ADR is Accepted.
Tickets and design comments may proceed before acceptance; code-bearing
detector PRs may not merge before the authority artifact lands.

## 6. Boundary — what this ADR does NOT decide

- Exact SQL/graph traversal queries, threshold constants, render limits, or
  suppression durations. #14462 owns those with tests.
- The #13751 hook admission model. This ADR only defines the data boundary.
- Fleet Manager UI and lifecycle controls. #13448/#13015 own those surfaces.
- Mailbox integrity recovery. #14426 remains the trust prerequisite for
  A2A-derived ask/answer classes.
- Temporal rollup retention for old findings. ADR 0028 is a future consumer
  option, not a requirement here.

## 7. Related

- **Source Discussion:** #14447.
- **Resolves:** #14461.
- **Implementation leaf:** #14462.
- **Sibling/precedent:** #14306 (arch-debt detection), #14453 (direction model).
- **Consumers:** #13751 (hook direction), #13448/#13015 (Fleet Manager).
- **Integrity dependency:** #14426.
- **Composes:** ADR 0005, ADR 0023, ADR 0024, ADR 0026, ADR 0028.
- **Substrate (V-B-A source):** `ai/services/graph/GapInferenceEngine.mjs`,
  `ai/services/graph/GoldenPathSynthesizer.mjs`,
  `ai/services/memory-core/GraphService.mjs`,
  `resources/content/discussions/chunk-2/discussion-14447.md`.

## 8. Status / Lifecycle

- **Proposed** — becomes **Accepted** on approved, green PR merge at the human
  merge gate (cross-family review required; GPT author -> non-GPT reviewer).
- **Re-review triggers:** any PR that changes the `STALL_*` schema, defer
  4-tuple, source-fidelity taxonomy, consumer boundaries, graph persistence
  type, or ranking/visibility relationship MUST cite this ADR and update the
  affected section.

Origin Session ID: `8facbc96-c346-4633-9141-79a968ca1c5d`

Retrieval Hint: `query_raw_memories("work graph stall inference STALL_FINDING defer tuple source fidelity ADR 0030 #14461 #14447")`
