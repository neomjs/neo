# The Embedding Lane: Where a Corpus Becomes Vectors

A subsystem can be composed entirely of careful parts and still be wrong as a whole.

The embedding lane is the clearest example Neo has. Every layer in it was added
deliberately, by someone solving a real problem, with a docblock explaining the
reasoning. A width clamp reserved a provider slot. A queue kept the client from
competing with itself. A budget bounded how long one repository could hold a
slot. A guardrail refused inputs the provider would reject. Each is defensible
in isolation.

Read together, they bounded a lane declaring four parallel slots to one request
at a time — and no single file said so. The composition was only discoverable by
instrumenting a running deployment, because the lane has no owning document and
no owning subsystem: `TextEmbeddingService` lives under `ai/services/memory-core/`,
`VectorService` under `ai/services/knowledge-base/`, the geometry leaves in
`ai/configBase.mjs`, the slice and lease scheduling in `ai/daemons/orchestrator/`,
the shape verification in `ai/providerLaneLiveShape.mjs`. Four owners, no owner.

This guide is the map. I wrote it after establishing the behaviour below cost me
a full session of plane reads and nine wrong intermediate claims before
converging — eight of which were answerable from content already in the
repository, sitting in a 492-line prose document, a deployment Compose comment,
an ADR, a ticket acceptance criterion, a parser docstring, and a merged PR. The
information existed. It was unreachable *as a whole*, which is a different
problem from missing documentation and has a different fix.

**If you are building an embedding lane somewhere else, four of those nine
mistakes were not about Neo at all**, and they are the reason this document is
worth reading outside this repository:

1. **A declared parallelism is not a measured one.** Our config declared four
   slots and the lane used one. Nothing lied — no layer claimed more than it
   delivered — and the gap lived in the composition. If you declare concurrency
   anywhere, the only honest confirmation is watching two requests overlap.
2. **Know what unit your capacity number is in.** A local OpenAI-compatible
   engine expands one multi-input request into one task *per input*, so the work
   a client offers is `concurrency × width`, not `concurrency`. Binding one
   number to request count, server tasks and batch width at once reproduces the
   same declaration-versus-behaviour gap one layer down. I got this wrong first
   and a reviewer caught it.
3. **A guard that fails closed converts a wrong answer into a silent loss.**
   Ours refused to bind vectors it could not prove were positionally correct —
   which is right, and meant work already paid for was discarded with nothing in
   the logs. Fail-closed guards need their losses *reported*, or the safety
   turns into invisible waste.
4. **Throughput can be a correctness property, not a performance one.** When a
   corpus cannot finish inside one scheduling slice, the partial checkpoint state
   becomes absorbing: the machinery reports healthy forever while the knowledge
   base never receives its content. Any lane with a per-pass budget and a
   completion-gated checkpoint can reach this, and it does not look like an
   outage.

The Neo-specific parts are the file names. The transferable part is that all four
were invisible to code review and visible to one instrumented run.

## How to read this document

Two kinds of fact live here and they decay at different rates. Conflating them is
what makes a ground-truth guide dangerous rather than merely stale.

**Contract facts** — what the code does, the arithmetic, the field names, the
state machine. These change only when someone edits the code, so they are stated
plainly with the citation that lets you re-derive them.

**Plane facts** — what is deployed, what is materialised, which signal has
actually fired. These change without anyone editing anything. Each is written as
a **dated observation plus the command that re-reads it**, and a plane fact
stated in the timeless present is a defect in this document.

The distinction is not theoretical. Written one day earlier, this guide would
have said *"the tenant parser declines vendored trees"* — true of the contract,
false of the plane, because the deployed revision predated the exclusion. A
reader trusting it would have concluded a corpus was clean when ~86.7k vendored
chunks were still resident.

## 1. Authority map: which value decides what

```mermaid
flowchart TD
    Parallel["leaf: localModels.embedding.parallel<br/>NEO_LOCAL_MODELS_EMBEDDING_PARALLEL · default 1"]
        --> Concurrency["request CONCURRENCY<br/>how many POSTs outstanding"]
    Concurrency ~~~ Width["leaf: openAiCompatible.batchEmbeddingChunkSize<br/>default 5"]
    Width --> Requests["request WIDTH<br/>inputs per POST"]
    Requests ~~~ Ctx["leaf: localModels.embedding.contextLimitTokens<br/>default 32768"]
    Ctx --> Band["admission band<br/>min of the two ceilings"]
    Safe["leaf: localModels.embedding.safeProcessingLimitTokens<br/>default 28672"] --> Band
    Band --> Estimate["estimateBandTokens<br/>floor(ceiling / 1.35)"]
    Estimate --> Guard["guardrail: split or refuse<br/>before the provider is called"]
    Guard ~~~ Slice["leaf: orchestrator.tenantRepoSync.sliceBudgetMs<br/>default 300000"]
    Slice --> RepoBound["per-repo slot bound<br/>rotate, keep the lease"]
    RepoBound ~~~ Hold["leaf: orchestrator.heavyMaintenance.maxActiveHoldMs<br/>default 1800000"]
    Hold --> LeaseBound["outer lease bound<br/>stand down, release"]
```

*All six leaves are declared in `ai/configBase.mjs`.*

**Contract.** `EMBEDDING_TOKEN_ESTIMATE_DRIFT_FACTOR = 1.35`
(`ai/embeddingSafeBand.mjs:42`) and `BYTES_PER_TOKEN_HEURISTIC = 3`
(`ai/services/memory-core/helpers/consumerFrictionHelper.mjs:122`). The band is
`min(contextLimitTokens, safeProcessingLimitTokens)`, then
`floor(ceiling / 1.35)`; byte estimates are `ceil(bytes / 3)`.

**The distinction the diagram exists to draw: width and concurrency are separate
contracts.** Width is a durability decision — how many inputs one failure or one
yield can cost. Concurrency is a throughput decision — how many of those may be
in flight. They were conflated: `parallel` was spent computing a *width*
(`parallel - 1`), and the concurrency it declares was used by nothing.

The clamp is worth reading precisely, because the obvious reading of it is wrong
and this document previously carried that reading. The provider's capacity unit
is a **task** — one multi-input POST expands to one task per input — so a client
*can* control offered work, and `parallel - 1` did reserve real headroom: three
inputs is three tasks against four slots, which leaves one free. The clamp was
arithmetically correct and its intent was sound. Its defect was the unit it was
spent in: headroom expressed as a width consumes the same budget concurrency
needs, so a lane declaring four slots offered one request at a time. A correct
reading of this passage cost a reviewer a round, and the wrong reading is the
tempting one.

`NEO_LOCAL_MODELS_EMBEDDING_PARALLEL` is the SSOT for the intent and applies
across provider options. `LLAMA_ARG_N_PARALLEL` in a deployment's Compose is a
second declaration of the same fact and violates that SSOT; the two agreeing is
a deployment's responsibility, not a guarantee.

## 2. One slice, as it actually runs

```mermaid
flowchart TD
    Admit["repo admitted to a slot<br/>startedMs anchored here"] --> Envelope["envelope materialised<br/>one manifest read"]
    Envelope --> Plan["inputs divided by WIDTH<br/>into provider spans"]
    Plan --> Dispatch["spans dispatched<br/>bounded by CONCURRENCY"]
    Dispatch --> Provider["provider expands one POST<br/>into one task per input"]
    Provider --> Batch["span completes"]
    Batch --> Check{"slice budget<br/>elapsed?"}
    Check -->|no| Dispatch
    Check -->|yes| Yield["yield: carry the completed prefix,<br/>rotate to the next repo"]
    Yield --> Admit
```

**Contract.** The slice budget is anchored per repository at *admission*, not
per sweep (`ai/daemons/orchestrator/scheduling/tenantRepoSync.mjs`,
`createSliceBudgetPredicate`). A sweep-wide budget would be spent by the first
admitted repository and starve the tail — the per-repo anchoring is the fix, and
it is also why honouring every budget still occupies the exclusive heavy slot for
roughly `N × sliceBudgetMs`.

The predicate is consulted *between* spans and never before the first, so actual
occupancy is the budget plus one span envelope. That is the forward-progress
guarantee: at least one span always lands per acquisition, so the lane cannot
livelock against its own fairness bound.

**Plane, observed 2026-08-20 on an external tenant deployment.** The provider
slot log showed roughly twenty consecutive `launch → release → launch`
transitions with never two tasks in flight, while 86,946 chunks waited. One
13,725-token input consumed an entire five-minute slice and the repository
reported `embeddings=1` at budget expiry. Re-read with:

```bash
curl -s "$EMBEDDING_HOST/slots" | jq '[.[] | {id, state}]'
```

## 3. Checkpoint states, and the edge that cannot be traversed

```mermaid
stateDiagram-v2
    [*] --> uninitialized
    uninitialized --> partial: slice expires mid-corpus
    partial --> reattempt: next pass admitted
    reattempt --> partial: slice expires again
    reattempt --> completed: pass finishes the corpus
    completed --> [*]: lastIngestedRev advances
    note right of reattempt
        lastIngestedRev is written ONLY by
        a pass that completes. A corpus
        larger than one slice never
        completes one, so the partial
        cycle is absorbing until
        throughput changes.
    end note
```

**Contract.** The checkpoint advances on a completed pass. A deferred outcome is
*incomplete, not failed*: the checkpoint stays where it is, `consecutiveFailures`
is neither reset nor incremented, and `lastRunAttemptAt` advances so the next
due-check measures from this attempt. Leaving the streak untouched is the
load-bearing half — incrementing would climb toward the backoff cap for a
condition that is not the repository's fault.

The consequence is the shape of the incident: a corpus that cannot finish inside
one slice makes `partial` absorbing, and the lane runs forever reporting healthy
machinery over a knowledge base that never receives its content. This is why
throughput is a correctness concern here and not only a performance one.

## 4. Guard interaction: pairs whose joint outcome differs from either alone

```mermaid
flowchart TD
    subgraph pair1["slice budget × checkpoint"]
        direction LR
        A1["budget expires"] --> A2["deferred, not failed"] --> A3["checkpoint frozen"]
    end
    subgraph pair2["admission band × provider tokenizer"]
        direction LR
        B1["ceil(bytes / 3) estimate"] --> B2["provider's real tokenizer differs"] --> B3["admitted input the provider refuses,<br/>or refused input it would have taken"]
    end
    subgraph pair3["starvation watchdog × lease holder"]
        direction LR
        C1["waiter starves"] --> C2["watchdog names the holder"] --> C3["holder consults no bound<br/>so naming changes nothing"]
    end
    subgraph pair4["carry arithmetic × an unstated invariant"]
        direction LR
        D1["formula: count × width"] --> D2["stated reason FALSE<br/>(final span is short)"] --> D3["conclusion held anyway,<br/>via dispatch order nobody wrote down"]
    end

    pair1 ~~~ pair2 ~~~ pair3 ~~~ pair4
```

**The fourth pair is the one worth internalising, and it is not a failure — it is
a correct answer resting on a reason its own comment got wrong.** The carry
computed a completed span as `completedChunkCount * chunkSize`, justified by *"a
yield lands on a chunk boundary, so every completed chunk is full-width"*. That
justification is false: the final span is short whenever the input count is not a
multiple of the width.

The product was nevertheless always right, for a reason the comment never stated —
the dispatch loop consults the yield predicate only while spans remain
undispatched, and dispatch is in span order, so a yielded prefix structurally
excludes the short final span. Per `TextEmbeddingService.mjs`: *"No reachable
input reddened the product, and none can."*

So nothing was ever mis-carried, and this document previously claimed otherwise —
it described work conservation switching itself off and a lane re-purchasing
vectors with nothing in the logs. **That failure never occurred.** It was derived
from the mechanism rather than observed, which is precisely the error the passage
was trying to teach.

**The real lesson is narrower and more useful: a computation that is correct by
accident is one refactor from being wrong in silence.** The repair passes the
measured prefix instead of re-deriving it — not because the derivation was
producing bad spans, but because its correctness depended on a caller-side
ordering invariant the leaf cannot see. Reorder dispatch, or consult the predicate
once more after the last admission, and it returns a count one width too large; at
that point the ordered-embedding assembly throws from inside the yield
constructor, the abandonment loses its yield code, and a resumable checkpoint
becomes a hard failure. Two branches also disagreed about the same prefix, since
the failure path one level up already passed the measured count.

**A guard that fails closed converts a wrong answer into a silent loss** — the
reason the latent version was worth removing before anything reached it. That
trade is usually right, and it means such a loss needs its own report, or the
safety property hides the regression it prevented.

## 5. Verified axes, and the one that is not

```mermaid
flowchart TD
    Live["live /slots reading"] --> Shape["providerLaneLiveShape<br/>declared intent vs observed shape"]
    Shape --> V1["VERIFIED: slot count"]
    Shape --> V2["VERIFIED: per-slot context"]
    Shape --> V3["VERIFIED: reason codes when unreadable"]
    Live -.-> U1["NOT VERIFIED: utilization<br/>are the slots USED?"]
    U1 -.-> Gap["a lane can report four slots<br/>at 16384 tokens each,<br/>truthfully, and use one"]
```

**Contract.** `ai/providerLaneLiveShape.mjs` reads the live `/slots` endpoint and
compares observed shape against declared intent. Its own docblock states the
boundary: *"liveness answers 'can the provider respond?', never 'is the provider
shaped the way this deployment intends?'"*. It is pure by construction, never
throws, and emits greppable reason codes rather than prose — because those codes
reach an operator through the deployment-state snapshot, where a renamed string
silently breaks whatever matched on it.

**Shape is verified; utilization is not.** Both statements in the gap node can be
true simultaneously, and for a period they were. A verification layer that
answers the adjacent question confidently is more dangerous than one that answers
nothing, because its green is acted upon.

## 6. Code locality: the ownership vacuum

```mermaid
flowchart TD
    subgraph mc["ai/services/memory-core/"]
        TES["TextEmbeddingService<br/>provider dispatch, request queue"]
    end
    subgraph kb["ai/services/knowledge-base/"]
        VS["VectorService<br/>batching, guardrail, poison isolation"]
        IS["IngestionService<br/>chunk identity, telemetry"]
        Fmt["helpers/embeddingInputFormat<br/>the provider input string"]
    end
    subgraph orch["ai/daemons/orchestrator/"]
        TRS["TenantRepoSyncService<br/>sweep, slice budget, checkpoints"]
        Lease["HeavyMaintenanceLeaseService<br/>outer lease, fairness vote"]
    end
    subgraph cfg["ai/"]
        Leaves["configBase.mjs — the leaves"]
        LiveShape["providerLaneLiveShape.mjs"]
    end
    TRS --> VS --> TES
    IS --> Fmt
    VS --> Fmt
    Lease --> TRS
    Leaves --> TES
    Leaves --> VS
    Leaves --> TRS
```

Nothing here is a mistake in isolation. The vacuum is that no box owns *the lane*,
so a defect spanning three of them belongs to nobody, and the person who finds it
is whoever happened to be measuring that week.

## Traps this document exists to remove

Each of these cost a real session, and each was answerable from something already
committed.

- **The 32 GiB memory ceiling looks unjustified until you read the Compose
  comment that derives it.** KV cache is *linear*, not quadratic:
  `ctx × layers × kv_heads × head_dim × 2 × 2`. The n² term is the attention score
  matrix and scales with `UBATCH`, which is what the ceiling is actually sized
  for. Asking for more memory before reading that derivation is asking a
  deployment to pay for a misreading.
- **Fused attention is not an unexplored win.** It was attempted and produced no
  reduction; the same Compose comment records it.
- **A guard's docblock describes what the guard does, never that anything calls
  it.** A generation-election store can document that an input-strategy change
  *"invalidates every existing vector"* while no code in this lane constructs such
  a generation. Before asserting a mechanism exists, grep for a **call site** — a
  function named in a comment is not a function that is called.
- **Vendored trees are excluded by contract and may still be resident on a
  plane.** The exclusion is a parser change; the resident rows are a deployment
  fact. Ask both questions separately.
- **Absence of a re-embed trigger is not the same as one being expensive.**
  Incremental selection collects existing ids and skips them, and the provider
  input string is *derived* — not a member of a chunk's `hashInputs` — so changing
  the input format does not change any chunk id. Re-ingestion therefore re-embeds
  nothing. `parserVersion` **is** a hash input, which makes it the only mechanism
  that re-mints ids today, and nothing schedules it.
- **"Nothing is dispatched into a provider that just timed out" is a real
  guarantee, and it hangs by one thread — a caller hook that cannot throw.** The
  two local providers have different admission machinery (native Ollama: a capped
  slot released on provider settlement; OpenAI-compatible: a single-lane queue
  whose drain selects the next task immediately after a rejection), and
  `TextEmbeddingService.notifyProviderTimeout` exists so they owe the caller one
  identical *ordering* promise: the caller's circuit is told **synchronously**,
  before admission advances, so the drain cannot select the next span first.
  Expressing that ordering per-provider instead of once is what let it exist in
  only one of them.
  Its containment cell states the exception precisely: a hook that opens its
  circuit and *then* throws is contained, but **a hook that throws before opening
  its circuit is outside the guarantee** — this layer will not invent fallback
  circuit authority, so a later dispatch becomes possible and it is the caller's
  contract to keep. Today that exception is unreachable: exactly one production
  hook implements it, and its only pre-`abort()` statement builds an `Error` from
  a literal and a constant, so it cannot throw. **That is a property of that hook,
  not of the lane** — a future hook that resolves config, reads a getter, or
  formats a message before aborting re-enters the exception, and the failure is
  silent: a span reaches a provider already known to be dead, and nothing in the
  ordering says so. If you write one of these, abort first and do everything else
  after.
  Do not read this as the native-Ollama stranding case, which is the opposite
  side of the same boundary: that one needs a request **already dispatched** and
  concerns server-side work outliving the client's abort. This one is about
  whether the next span is dispatched at all, so if it never is, the other
  mechanism has nothing to strand.

## Related

- `learn/agentos/KnowledgeBase.md` — the corpus this lane feeds.
- `learn/agentos/cloud-deployment/TenantIngestionModel.md` — ingestion
  configuration, triggers and telemetry; this guide does not duplicate its scope.
- `learn/agentos/decisions/0019-aiconfig-reactive-provider-ssot.md` — the remedy
  shape this guide borrows: make the mechanism readable rather than asking for
  more care.
- `learn/agentos/decisions/0022-heavy-maintenance-scheduling-fairness.md` —
  cooperative yield only; the lane never preempts a live holder.
