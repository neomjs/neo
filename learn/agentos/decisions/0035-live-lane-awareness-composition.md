# ADR 0035: Live Lane Awareness — typed route, lifecycle frontier, Bird-View references, and fenced hook projection

> The architecture contract for seeing **what requires a response, what the canonical Golden Path
> computed, and which queryable Bird Views can widen the frame** without turning their federation,
> Fleet Manager, or a stop hook into another scorer. The current-state surface is a bounded,
> expiring projection of independently owned facts. It is never durable truth, a dashboard digest,
> an assignment oracle, or a session-derived identity map.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-07-12 (transitions to Accepted only on approved, green PR merge at the human merge gate, per ADR 0005) |
| **Author** | @neo-gpt (Euclid), grounded in Discussion #15090 Cycle 7, its version-bound Fable falsifier, the non-author Step 2.5 sweep, and fresh `dev` source inspection |
| **ADR classification** | `ADR_REQUIRED` — six independently implemented leaves cross Golden Path, GitHub Workflow, Memory Core, hooks, harness identity, and future Fleet reads; service ownership and failure semantics cannot remain in Discussion comments |
| **Resolves** | #15101 — first, merge-order-gating leaf of Epic #15100 |
| **Graduated from** | Discussion #15090, body `2026-07-12T17:16:30Z`; quorum: GPT author family + Claude non-author family, including Mnemosyne's exact-version revalidation and Grace's full Step 2.5 sweep |
| **Ontology parent** | Discussion #11375 — queryable synthesis and DerivedSignalContract; presentation is never a substitute for the live tool |
| **Composes** | ADR 0020 (Agent Harness identity/embodiment boundary), ADR 0028 (dynamic historical synthesis), ADR 0033 (one additive Golden Path authority) |
| **Mechanically amends** | ADR 0031 seam table and `learn/benefits/ArchitectureOverview.md` pointers only; no prior ADR's substance changes |
| **Precedent inputs** | ADR 0009 / `heavyMaintenanceLeasePrimitives.mjs` for token+TTL vocabulary; ADR 0015 / shared SQLite WAL; `SummarizationJobs` for a cross-MCP operational lease-table precedent |
| **Anti-precedent** | `walAppendLock.mjs` timeout fall-through, because this writer must never execute unfenced |
| **Anti-anchor for** | Static handoff/dashboard Bird Views; Markdown as route authority; a general AwarenessService; mutable session→agent identity; per-turn context-view curation; Fleet process-control implying awareness-read; online feedback-to-ranking |

---

## 1. Context and observed failure

Neo already computes a Golden Path, records lifecycle facts, serves historical sources, and runs
turn-end hooks. Those pieces do not yet form a trustworthy awareness loop:

- `GoldenPathSynthesizer` owns the scoring pass but writes `sandman_handoff.md` and returns only
  status/counts; the selected route remains method-local.
- `AgentOrchestrator.parseGoldenPath()` reparses the rendered Markdown with regular expressions.
- `.claude/hooks/laneStateStopHook.mjs` reads an unprovenanced `lifecycle-state.json` whose
  `goldenPathDirection` array has no producer version, source manifest, binding, or channel TTL.
- Memory/session history (#14435), resolved-PR conversation history (#15088), and the current lane
  landscape are different Bird Views with different sources. Combining their narratives would erase
  privacy, coverage, and drill-down contracts.
- Multiple Claude and Codex residents can target the same local substrate. Atomic rename prevents a
  torn read, but it does not prevent two writers from replacing each other's complete files.
- Session ids exist for correlation; they do not prove an agent identity or authorize another
  peer's lifecycle facts.

The operator's framing is one loop at three zoom levels: Golden Path provides canonical ranked
input, Bird Views provide queryable zoom-out/drill-down, and the hook makes immediate options
visible. The architecture must connect them while preserving the fact that only a peer chooses a
lane.

### 1.1 The authority split

| Surface | Owns | Explicitly does not own |
|---|---|---|
| Lifecycle frontier | Source-backed response-required facts and deterministic actor-stage order | Golden Path score, release direction, Bird-View synthesis |
| Computed Golden Path | One typed result from one canonical scoring pass | Human/peer judgment, lifecycle priority, Fleet authorization |
| Bird Views | On-demand, cite-backed derived signals for one source family and one requested window/frame | Hook-time ranking, durable current-state truth, automatic assignment |
| Projection writer | Fixed-slot validation, freshest-channel retention, binding resolution, and atomic transport | Source reads, inference, ranking, weighting, narrative generation |
| Hook reader | Bounded local validation and rendering | Network/graph access, identity inference, synthesis, admission changes |
| Future Fleet awareness reader | Explicit viewer binding and federation of source-admitted target partitions | Bulk-read-then-filter, process control, remote claiming/acting |

### 1.2 Non-goals

This record does not create a sixth v13.2 cornerstone, a new graph ontology, a general state
manager, a durable weekly report, a UI dashboard, or a hidden auto-planner. It does not combine the
two historical tools. It does not place future `.mjs` files; each implementation leaf runs
`structural-pre-flight` before selecting an exact class/file location.

## 2. Decision

### 2.1 One zero-authority federation, six explicit owners

The logical owners are fixed even where the implementation class name remains leaf-local:

| Boundary | Owner | Output | Consumer |
|---|---|---|---|
| Raw PR/review/check/assignment facts | GitHub Workflow services | Source records with GitHub ids/timestamps | Lifecycle-frontier producer |
| Raw claimed-task/direct-message facts | Memory Core A2A services | Source records with message/task ids/timestamps | Lifecycle-frontier producer |
| Lifecycle normalization | The #15100 lifecycle-frontier producer | `LifecycleFrontier` for one explicitly attested agent | Projection channel + interactive consumers |
| Route computation | `GoldenPathSynthesizer` and its routing helpers | `ComputedRouteResult` from the single canonical pass | Handoff renderer, AgentOrchestrator, projection channel |
| Bird-View synthesis | Each registered Bird-View operation | Its own source-specific, cite-backed response | Explicit caller only; projection stores descriptors, never results |
| Hook projection transport | A strict Memory-Core-owned operational projection writer | One expiring combined envelope per attested projection target | Claude/Codex local hook readers |
| Hook rendering | Each harness's stop-hook adapter | Fixed presentation: lifecycle → route → context references | Peer at turn boundary |
| Future Fleet awareness | A separate `fleet-awareness-read` facade plus source-owned admission | Per-target response-required frontiers + one global route + descriptors | Operator-facing Fleet surface |

The federation may validate schema, select the freshest envelope **within the same channel**, resolve
the safe consumer scope, and concatenate fixed slots in the fixed order shown above. It may not
inspect content to rank, suppress, boost, weight, summarize, or decide cross-channel importance.

**Teeth-test:** if the federation needs to decide which channel matters more in this turn, it has
become a fifth authority and the design fails.

### 2.2 `ComputedRouteResult`: one pass, typed once

The canonical Golden Path pass returns this logical v1 contract before any renderer runs:

```js
{
    schemaVersion: 'computed-route.v1',
    status, // fresh | empty | missing | stale | degraded
    capturedAt,
    sourceWatermark,
    expiresAt,
    routeVersion,
    sourceManifestHash,

    provenance: {
        producer: 'GoldenPathSynthesizer',
        runId,
        algorithmVersion,
        citations: []
    },

    freshness: {
        status, // fresh | stale | unverifiable
        checkedAt,
        expiresAt
    },

    route: {
        kind, // computed-ranked | current-focus-substitution | none
        items: [
            {id, title, score, rank, citations: []}
        ]
    },

    advisoryFallback: {
        kind: 'declared-intent',
        status, // available | empty | not-applicable | degraded
        items: [
            {id, title, citations: []}
        ]
    },

    citations: [],
    notAuthority: true
}
```

Invariants:

1. `route.items` is the only executable route slot. `advisoryFallback.items` is context and can
   never turn `status: empty` into a routed result.
2. `current-focus-substitution` is explicit; a renderer cannot manufacture it from prose.
3. `status`, freshness, and coverage are independent of item count. Missing/degraded is never
   normalized to empty.
4. Route identity is `{routeVersion, sourceManifestHash, sourceWatermark}`. A consumer may cite or
   cache it but may not recompute it.
5. The handoff renderer consumes this object. `AgentOrchestrator` consumes this object (or the same
   producer-stamped channel envelope) directly. Neither reparses Markdown as authority.
6. Human-readable `sandman_handoff.md` may remain a renderer output, but it is downstream evidence,
   not the machine contract.

### 2.3 `LifecycleFrontier`: exact response-required semantics

The lifecycle producer emits one agent-scoped envelope:

```js
{
    schemaVersion: 'lifecycle-frontier.v1',
    scope: {agentId, harnessInstance: null},
    status, // fresh | empty | missing | stale | degraded
    capturedAt,
    sourceWatermark,
    expiresAt,
    coverage: {sources: [], degradedSources: []},
    items: [
        {
            id,
            stage,
            kind,
            state,
            source,
            subjectId,
            headSha,
            actionableSince,
            checkedAt,
            citations: []
        }
    ],
    notAuthority: true
}
```

The producer orders stages first, then `actionableSince` oldest-first, then stable source id:

| Stage | Admission predicate | `actionableSince` | Reset/removal |
|---|---|---|---|
| 1. Own-PR repair | Current head has `CHANGES_REQUESTED`, failed required CI, or merge-conflict/non-mergeable state | First time the current head satisfies any repair predicate | Any head change resets every PR-derived row; clearing all repair predicates removes it; re-entry starts a new clock |
| 2. Own-PR reviewer routing | Own PR is non-draft; all required checks pass (or none exist); no outstanding review request; no current-head closing review | Time the current head first becomes reviewable | Head change or loss of reviewability resets/removes; a new outstanding request or current-head closing review removes it |
| 3. Requested review | A live review request targets the consuming agent and has no current-head closing review | Later of request creation or current-head change | Request removal, closing review, PR terminal state, or head change removes/resets |
| 4. Claimed A2A task | Structured A2A Task's current owner/target recipient is the consuming agent and its non-terminal state requires that agent's action (for example `InputRequired`) | Transition time into that actionable state | Ownership/recipient change, terminal state, or non-actionable transition removes/resets |
| 5. Direct message | Unread direct message targets the consuming agent | Message `sentAt` | Read/archive/retraction removes it |

For this contract, a **current-head closing review** is an `APPROVED` or `CHANGES_REQUESTED`
decision whose reviewed commit is the current head. A review attached only to an older head cannot
close the current head.

Explicit exclusions are as important as admissions:

- pending/running CI without a failed required check;
- ordinary issue assignment without a claimed actionable Task envelope;
- approved PR awaiting the human merge gate;
- draft PRs;
- unclaimed broadcasts and awareness-only A2A;
- missing, inferred, conflicted, or foreign identity;
- optional-check failure unless the owning repository policy marks it required.

Lifecycle facts stay lifecycle facts. They are never converted into Golden Path score inputs by
this composition.

### 2.4 Consumer binding is asymmetric and categorical

```js
{
    capability: 'self-awareness',
    agentId,
    harnessType,
    instanceKeyDigest,
    workspaceKeyDigest,
    sessionId, // correlation only
    status,    // attested | unverified | conflicted | stale
    provenance,
    assertedAt,
    expiresAt,
    conflicts: [],
    scopeResolution // agent-instance | agent | route-only
}
```

`agentId` comes from the canonical runtime identity/root binding. `instanceKeyDigest` and
`workspaceKeyDigest` are opaque categorical digests; raw local paths/user-data directories never
enter the projection. `sessionId` may correlate logs but may not select, repair, or override identity.

| Observed binding | Resolution | Lifecycle | Route |
|---|---|---|---|
| Explicit agent + unexpired, recipient-matching instance attestation | `agent-instance` | Same-agent overlay only | One global read-only route |
| Explicit, validated agent; instance unavailable; lifecycle producer declares the overlay agent-wide | `agent` | Same-agent overlay only | One global read-only route |
| Missing/inferred agent, identity collision, stale categorical proof, or recipient mismatch | `route-only` | Omitted with an explicit unavailable/conflicted reason | One global route if its own channel is fresh |
| Route missing/stale/degraded | Binding resolution unchanged | Lifecycle may still render if valid | Route rows omitted; channel status remains visible |

There is no `last writer wins` identity, numeric confidence threshold, title/path inference, or
session-to-agent map. Foreign lifecycle absence is the safe result.

### 2.5 Bird Views stay separate runtime tools

The projection contains only fixed invocation descriptors:

```js
{
    operationId,
    schemaVersion,
    targetScope,
    presetArgs,
    capabilityStatus,
    purpose
}
```

The `self-awareness` capability fixes three semantic slots. Exact operation ids bind when each leaf
registers its tool; membership cannot be curated per turn:

| Slot | Source/owner | Required separation |
|---|---|---|
| Memory/session history | #14435 + ADR 0028 dynamic L3–L5 synthesis | Private/team memory policy, session citations, and zero durable L3–L5 output |
| Resolved-PR conversation history | #15088, provisionally `explore_pull_request_history` | Active+archive PR coverage, resolution-window semantics, comment/review drill-down |
| Current lane landscape | #15100 current-state Bird-View leaf, provisionally `explore_lane_landscape` | Goal trajectory, dependency/critical path, authority coverage; unknown stays unknown |

Descriptors contain no generated narrative, cached result, recommendation, or hidden query result.
The hook may render “available to explore” with the operation name/purpose. Invocation is explicit and
the owning tool rechecks authorization, freshness, source coverage, and citations.

Changing descriptor membership or preset arguments is a reviewed capability-contract change. A
facade/writer may not choose a “more relevant” Bird View for a particular turn; that would be covert
ranking.

### 2.6 Memory Core owns the strict projection writer

The selected writer owner is the **Memory Core operational service boundary**. The exact future
class/file still runs structural pre-flight, but the ownership and storage contract are decided here.

Why this boundary:

- every local resident already authenticates to Memory Core;
- its SQLite/WAL store is process-shared, so multiple MCP/service processes can arbitrate one target;
- it already has an operational `SummarizationJobs` lease-table precedent;
- it can expose one Memory-Core-owned projection root to local hooks without accepting arbitrary
  caller-supplied file paths;
- keeping the writer next to the broker lets the resource validate the fencing token immediately
  before rename. A remote lease plus an unguarded local write would not actually fence stale writers.

The writer owns two operational tables in the shared SQLite store. They are **not** Native Edge Graph
nodes and create no ontology:

```text
HookProjectionChannels(
    target_id, channel, source_watermark, envelope_json,
    captured_at, expires_at, updated_at,
    PRIMARY KEY(target_id, channel)
)

HookProjectionLeases(
    target_id PRIMARY KEY,
    fencing_epoch NOT NULL,
    holder_token_hash,
    holder_instance_digest,
    acquired_at,
    expires_at,
    state
)
```

`target_id` is server-derived from the attested categorical tuple
`{schemaVersion, capability, agentId, harnessType, instanceKeyDigest, workspaceKeyDigest,
projectionKind}`. Session id and raw paths are excluded. The output path is derived under the
Memory-Core-owned runtime root:

```text
<memory-core-runtime-root>/hook-projections/<target_id>/current.json
```

The target resident receives that path through its trusted boot/config boundary. A producer can
submit an envelope for an admitted target/channel; it cannot choose a filesystem path.

#### 2.6.1 Producer submission

1. Each source producer submits only its own typed channel plus source watermark and expiry.
2. A transaction validates schema, target admission, producer identity, and monotonic watermark.
3. A lower/regressed watermark is rejected; equal-watermark identical replay is idempotent; an
   equal-watermark different payload is a source conflict and degrades that channel.
4. Producers never read or write `current.json` and never merge another producer's channel.

#### 2.6.2 Lease acquisition and resource-side fencing

1. Acquisition runs in a serialized SQLite write transaction. It succeeds only when the target row
   is unheld or expired. Success increments `fencing_epoch` monotonically and returns a random raw
   holder token; only its hash is stored.
2. `leaseTtlMs` is required from the Memory-Core configuration boundary. The primitive has no hidden
   default. Wave 1 uses a **bounded single-publication lease with no renewal**. If one local bounded
   render/write cannot finish before expiry, it aborts; adding renewal requires an ADR revalidation.
3. Normal contention returns `held`/retry metadata and performs no write. Missing SQLite, busy timeout,
   unreadable schema, or lease-service failure is fail-closed: no projection update.
4. Immediately before touching `current.json`, the winner begins a serialized SQLite write
   transaction and revalidates `{target_id, token hash, fencing_epoch, not-expired}` against the
   broker's clock. It then reads the latest committed channel rows.
5. The same transaction remains held while the writer creates a unique temporary sibling, flushes
   the complete payload, and atomically renames it to `current.json`. No takeover can commit between
   token revalidation and resource mutation.
6. Release/clear is conditional on the same token hash **and** epoch. A stale holder cannot release or
   overwrite a successor. Success and failure paths both use token+epoch-checked release.

This is the required fencing property: an epoch in JSON is diagnostic; the SQLite transaction around
the actual rename is what prevents an old holder from mutating the resource after takeover.

#### 2.6.3 Crash, stale, and malformed behavior

| Failure | Required behavior |
|---|---|
| Crash before temporary file | SQLite transaction/connection releases; old complete projection remains; lease expires for takeover |
| Crash during temporary write | Temporary sibling is ignored; `current.json` remains old-complete; takeover removes orphan siblings after token+epoch acquisition |
| Crash after rename before lease clear/commit | New file is complete and contains only previously committed source envelopes; lease expires; successor reacquires with a higher epoch and may republish |
| Expired holder wakes after takeover | Resource-side token+epoch revalidation fails before any file mutation |
| Malformed lease row | Quarantine diagnostics; reset only inside the serialized transaction; next acquisition increments epoch; never “repair then write” unfenced |
| Malformed channel envelope | Mark only that channel degraded; retain other fresh channels; never parse prose to recover it |
| SQLite/Memory Core unavailable | Do not update projection; hook later observes missing/stale and falls back to the bare policy renderer |
| Atomic rename unavailable/not same filesystem | Refuse publication; never downgrade to truncate-in-place or copy-over |

#### 2.6.4 Precedent disposition

| Existing primitive | Reused concept | Why it is not reused unchanged |
|---|---|---|
| `heavyMaintenanceLeasePrimitives.mjs` | Required TTL, owner token, stale/malformed classification, token-checked release, `wx` vocabulary | Checkout-local file ownership cannot arbitrate isolated residents, and it does not resource-fence a stale writer after takeover |
| `SummarizationJobs` | Shared SQLite operational lease table across MCP instances | Current path can execute when DB is missing, has no monotonic fencing epoch, and completion is not token+epoch checked; those are forbidden here |
| `walAppendLock.mjs` | Byte-match race awareness | It deliberately runs unlocked after timeout to preserve never-fail memory writes; projection correctness requires the opposite trade-off |

#### 2.6.5 Publication sequence

| Step | Actor | Durable/resource action | Failure result |
|---|---|---|---|
| 1 | Lifecycle or route producer | Conditionally upsert only its channel by target + monotonic watermark | Regressed/conflicting submission is rejected or channel-degraded; file unchanged |
| 2 | Projection writer candidate | Acquire target lease transactionally; mint token and increment fencing epoch | Contention returns held; no file access |
| 3 | Projection writer winner | Open serialized write transaction; revalidate target + token hash + epoch + broker-clock expiry | Mismatch/expiry aborts; stale holder cannot reach the resource |
| 4 | Projection writer winner | Read latest committed fixed-slot channels and assemble without content ranking | Malformed channel degrades independently; valid sibling channels survive |
| 5 | Projection writer winner | Write+flush unique temporary sibling, then atomic rename to `current.json` while the transaction remains held | Old-complete survives before rename; new-complete survives after rename; never torn/partial |
| 6 | Projection writer winner | Clear lease only with matching token+epoch and commit | Crash leaves bounded expired lease for higher-epoch takeover |
| 7 | Hook reader | Read local `current.json`; validate target/schema/binding/channel TTLs; render fixed order | Invalid/missing projection falls to bare policy; no network repair |

### 2.7 The combined projection contract

The writer publishes exactly one logical envelope per target:

```js
{
    schemaVersion: 'live-lane-awareness-projection.v1',
    publication: {
        targetId,
        fencingEpoch,
        generatedAt,
        producerWatermarks: {}
    },
    consumerBinding,
    lifecycleActions,
    computedRoute,
    contextViews: [],
    coverage: {sources: [], degradedSources: []},
    notAuthority: true
}
```

The writer selects the newest accepted envelope per fixed channel from
`HookProjectionChannels`; it never derives one by read-modify-writing the file. A lifecycle update
therefore cannot erase the current route, and a route update cannot erase lifecycle. Every channel
retains independent status, watermark, captured time, expiry, provenance, citations, and honest
empty/missing/stale/degraded state.

### 2.8 Hooks are pure bounded renderers

At hook time, Claude and Codex may only:

1. read their trusted target's `current.json` locally;
2. validate schema, target/binding, categorical recipient, channel provenance, and expiry;
3. bound the number/bytes of rendered rows;
4. render the fixed order lifecycle → route → context-view references; and
5. fall back to the existing bare no-hold/operator-dialogue policy when enrichment is absent.

They may not call Memory Core/GitHub/network, walk a graph, invoke an LLM, rank, infer identity,
select Bird Views, copy a Bird-View narrative, or change turn admission.

| Channel state | Hook rendering | Admission effect |
|---|---|---|
| Fresh lifecycle | Bounded response-required rows with `actionableSince` and visible “as of” | None |
| Empty lifecycle | Explicit honest-empty status when density permits | None |
| Missing/ambiguous/stale/degraded lifecycle | No action rows; concise unavailable/stale/degraded marker | None |
| Fresh route | Bounded `route.items`, route version, and visible “as of” | None |
| Empty route | Honest empty; advisory context remains visibly non-executable | None |
| Missing/stale/degraded route | No ranked rows; concise channel status | None |
| Bird Views | Fixed invocation references only | None |

“Fail-open” here means **enrichment failure has zero effect on the independent hook policy**. It
does not mean malformed or stale facts are rendered.

### 2.9 Capability separation, including future Fleet reads

| Capability | May read | May act | Inheritance |
|---|---|---|---|
| `self-awareness` | Own admitted lifecycle, one global route, fixed descriptors | No automatic action; peer chooses | Grants neither Fleet read nor process control |
| `fleet-awareness-read` | Only target partitions each owning source authorizes for the explicit viewer; one global route | No claiming/acting for targets | Does not inherit process control; process control does not grant it |
| `fleet-process-control` | Existing process-runtime/control surface only | Explicit actor-bound start/stop/control operations | Grants no lifecycle, memory, or Bird-View read |

A future Fleet response uses `responseRequiredFrontiers`, never the existing cockpit process
`lifecycle` field. Each source admits each requested target **before** federation. The facade may
concatenate admitted partitions and report `{authorizedTargets, unavailableTargets,
degradedSources}`; it may not bulk-read then security-filter. Partial authorization remains visible
as partial coverage. A route item never authorizes remote claiming or action.

### 2.10 Offline feedback firewall

The awareness system may record three separate observations:

- **exposure:** which typed channels/descriptors were rendered, at which versions/watermarks;
- **explicit choice:** which lane a peer explicitly claimed or selected, if any; and
- **later outcome:** source-backed lifecycle/result facts observed later.

These observations are non-causal evidence. Missing outcome remains unknown; no “ignored route” or
“bad choice” is inferred. They may be used in offline hindcast/evaluation such as #14565. They may
not be imported, queried, or joined by the online Golden Path scoring pass, lifecycle admission,
projection writer, or hook renderer. A proposed online use reopens this ADR and ADR 0033 before code.

### 2.11 Migration and legacy quarantine

Migration is staged, but authority is never dual:

| Phase | Change | Authority rule | Exit evidence |
|---|---|---|---|
| 0. ADR gate | Accept this record before code leaves merge | Existing runtime remains current; new code is not code-ready before acceptance | Human merge gate |
| 1. Typed route | Canonical pass returns `ComputedRouteResult`; handoff renderer consumes it; projection submission receives the same object | Scoring executes once; Markdown is downstream only | Route schema/empty/degraded/current-focus tests + renderer parity |
| 2. Direct consumer | `AgentOrchestrator` consumes typed route/channel and deletes `parseGoldenPath()` authority | No indefinite regex/typed dual path | Exact route, advisory-non-executable, and no-Markdown-parse tests |
| 3. Projection shadow | Writer publishes typed `current.json`; new hook readers validate in shadow/diagnostic mode | Legacy file is never translated/promoted into the typed envelope | Lease contention, crash takeover, channel-no-lost-update, binding isolation, expiry tests |
| 4. Reader cutover | Claude and Codex render only typed projection enrichment | Invalid/missing typed projection falls to bare policy, **not** legacy data | Same global route across residents; never-foreign lifecycle; page/console/process evidence as applicable |
| 5. Quarantine removal | Delete legacy `lifecycle-state.json` writer/reader and `goldenPathDirection` compatibility shape | No legacy fallback remains | Repository sweep + two consecutive live producer cycles + multi-resident L3 proof |

The required L3 proof uses at least two simultaneously resident Codex instances and one Claude
resident when available: the route identity must match globally; lifecycle must remain recipient
exact; an intentionally killed writer must be taken over; no page/hook/process error may be hidden.
If Claude is temporarily unavailable, the code merge may proceed only with both harness contract
tests green and a named post-merge Claude validation gate; legacy authority still may not return.

## 3. Alternatives considered

| Option | Disposition | Reason |
|---|---|---|
| Static Markdown/HTML/dashboard Bird View | Rejected | Stale presentation, no runtime drill-down, wrong authority; directly contradicted by #11375 and operator P0 |
| Monolithic AwarenessService | Rejected | Becomes a fifth source/scorer and collapses per-source degradation |
| Hook-time live queries | Rejected | Network/inference in a bounded enforcement path can trap or slow every turn |
| One global mutable mixed-truth object | Rejected | Global route and per-agent lifecycle have different scopes; last writer loses channels and risks leakage |
| Session-derived binding | Rejected | Correlation is not identity; collision silently exposes foreign lifecycle |
| Checkout-local file lease only | Rejected | Cannot arbitrate isolated residents and cannot resource-fence stale writers |
| Brokered lease + target-local unguarded writer | Rejected | Epoch exists only on paper; stale process can still rename after takeover |
| Memory-Core-owned broker **and** resource writer | Selected | Shared arbitration, source channel retention, categorical targets, and token+epoch validation can surround the actual rename |

## 4. Consequences

### Positive

- one Golden Path pass serves every consumer without Markdown reparsing or a second scorer;
- lifecycle facts remain exact, source-timed, and separately visible;
- historical Memory/session and resolved-PR Bird Views remain two real runtime tools;
- current-state landscape becomes a third independent view rather than a static digest;
- hooks stay fast/local while receiving honest, scoped, multi-instance-safe enrichment;
- Fleet Manager can later show awareness without inheriting broad data access or remote action;
- stale-writer fencing is enforced at the file resource, not merely described in a lease record.

### Negative / accepted cost

- Memory Core gains two operational tables and a small shared projection directory;
- the publication transaction deliberately holds the SQLite write lock across one bounded local
  file flush+rename, trading brief write contention for a real fencing boundary;
- every producer must carry watermarks, expiries, provenance, and citations rather than sending a
  convenient array;
- migration removes a simple Markdown parser and legacy JSON reader only after multi-consumer proof;
- a Memory Core outage yields stale/missing enrichment instead of a best-effort write. This is the
  correct fail-closed trade for facts that could leak another peer's obligations.

## 5. Implementation and evidence gates

All code leaves under #15100 remain not-code-ready until this ADR is Accepted. Later tickets derive
their one-PR contracts from this table, not Discussion archaeology:

| Leaf family | Minimum executable evidence |
|---|---|
| Typed route + consumer migration | Schema tests for every status; route/advisory separation; current-focus substitution; one-pass/one-version identity; handoff parity; AgentOrchestrator no Markdown parse |
| Lifecycle frontier | Full admission/exclusion matrix; head-change clocks; required-vs-optional checks; current-head review semantics; claimed-task ownership; direct-vs-broadcast; never-foreign identity |
| Projection broker/writer | Two-process contention; monotonic epoch; token+epoch release; expired takeover; old-holder wake; malformed row; DB unavailable; atomic crash points; channel watermark regression/conflict; no lost channel update |
| Claude/Codex readers | Bound byte/row density; schema/recipient/TTL rejection; independent channel degradation; bare-policy fallback; descriptor-reference-only behavior |
| Current lane landscape | Goal/dependency/authority dimensions; cite-backed unknown coverage; no durable current-state write; no ranking/assignment |
| Offline feedback | Separate exposure/choice/outcome records; missing-outcome unknown; static import/dependency or runtime test proving no online GP consumption |
| Future Fleet read | Explicit viewer binding; source-owned per-target denial/partial coverage; no process-control inheritance; no remote-action grant |

## 6. Revalidation triggers and liveness

Reopen this decision before implementation diverges when any of these occurs:

1. Gemini family returns while #15100 is active — request an independent challenge of dynamic query
   vs expiring projection, cache identity, and active/archive separation.
2. Memory Core stops being shared by all target residents, or projections must cross a machine trust
   boundary. This ADR decides a **local Agent OS** projection; a remote/cloud broker is a new topology.
3. The writer owner, shared runtime root, or SQLite/WAL posture changes.
4. A new hook/harness/AgentOrchestrator consumer needs fields not represented here.
5. Any proposal selects `contextViews` per turn, copies Bird-View results into the projection, or
   feeds Bird Views/feedback/lifecycle into online GP ranking.
6. Fleet awareness attempts to inherit process-control credentials or perform bulk-read-then-filter.
7. One bounded publication cannot fit the explicit lease TTL and someone proposes renewal or a
   long-held leader lease.
8. The fixed SQLite transaction across flush+rename measurably starves Memory Core writes; the
   replacement must preserve resource-side fencing, not weaken to an advisory lease.

## 7. Decision-record relationships

- **ADR 0020:** instance/harness identity is transport and embodiment; it does not redefine agent
  authority.
- **ADR 0028:** historical L3–L5 Bird Views remain query-time and never durably cascade.
- **ADR 0033:** Golden Path stays one additive, advisory computed-route authority; awareness never
  gates or silently retrains it.
- **ADR 0031:** receives exactly one 0035 seam row in this diff.
- **ADR 0024:** not amended by this docs-only leaf. A later code leaf that introduces graph events
  must cite/update its vocabulary and protected-set disposition then.

## 8. Related artifacts

- Epic #15100 — Live Lane Awareness, Wave-1 composition
- Discussion #15090 — graduated Cycle-7 contract and signal ledger
- Discussion #11375 — current-state/historical/future Bird-View ontology
- #15087 — existing stop-hook producer/typed-route consumer, retaining parent #13652
- #14435 — Memory/session dynamic history path
- #15088 — separate resolved-PR conversation Bird View
- #14961 — hook freshness reader sibling
- #14565 / ADR 0033 — offline direction/intent evaluation consumer

Origin Session ID: 837ad74b-c2d2-413d-9aab-b7165a93a82a

Retrieval Hint: `ADR 0035 live lane awareness ComputedRouteResult lifecycle frontier Memory Core fenced hook projection`
