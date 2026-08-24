# ADR 0036: Durable Community Activity — provider-neutral admission, zero-authority attention, and explicit Task claim

> The authority contract for discovering and preserving supported repo-external community activity
> without turning provider noise into assignment, ranking, or wake authority. Durable source
> occurrences, attention eligibility, and an explicit canonical Task claim are three separate
> transitions. No consumer, accelerator, or projection may collapse them.

| Attribute | Value |
|---|---|
| **Status** | Accepted — 2026-07-18 (PR #15473) |
| **Author** | @neo-gpt, grounded in Discussion #15139's version-bound graduation, Grace's non-author Step 2.5 sweep, the operator's source-vs-attention clarification, and fresh source inspection |
| **ADR classification** | `ADR_REQUIRED` — the decision crosses provider acquisition, tenant-scoped Memory Core admission, content trust, Orchestrator coordination, MCP transport, Bird View, wake, and Task authority |
| **Resolves** | #15148 — first, merge-order-gating leaf of Epic #15145 |
| **Graduated from** | Discussion #15139 at body `updatedAt 2026-07-14T04:49:30Z`; GPT author-family signal plus Claude non-author-family approval |
| **Depends on** | ADR 0015 — one shared Memory-Core SQLite/WAL consistency boundary is the initial topology |
| **Aligns with** | ADR 0019 — source registrations are operational records, not AiConfig or Knowledge Base configuration |
| **Composes** | ADR 0035 — community history and attention projections remain outside `LifecycleFrontier` until explicit claim |
| **Mechanically amends** | ADR 0031's seam table and `learn/benefits/ArchitectureOverview.md` pointers only; no prior ADR is superseded |
| **Selected bundle** | H + I; K only for non-reconstructable acquisition; staged J; L/M with N transitional and O measurement-gated; T backed by R; U locally and W for hosted bootstrap; V/X deferred |
| **Anti-anchor for** | Notification-as-ledger, graph snapshots as history, provider polling inside Memory Core, caller-asserted tenant identity, automatic prose delivery, popularity telemetry, auto-assignment, or intuition-derived thresholds |

---

## 1. Context and observed failure

Neo can read known GitHub conversations, synchronize repository content, and route addressed
notifications. Those surfaces did not expose a new external reply inside an already-closed
Discussion in time for the team to respond. The failure is broader than one missing notification:
Neo has no repo-global, replayable community source with explicit coverage, attention, seen, and
claim semantics.

Per-viewer notifications are useful addressed-inbox accelerators, not repo-global history. Current
resource and Native Edge Graph snapshots describe state, not which occurrence or revision was
seen, admitted, or claimed. Webhooks can lower latency, but delivery loss and local deployments
still require reconciliation. A runtime Bird View can explain admitted facts, but it cannot be the
only place those facts exist.

### 1.1 Three transitions, three authorities

| Transition | Meaning | Authority it gains | Authority it does not gain |
|---|---|---|---|
| Source occurrence | A supported provider entity, occurrence, or revision was durably observed with explicit coverage | Historical reconstruction and provider-neutral queryability | Attention, assignment, Golden Path direction, Task state |
| Attention-eligible community item | An admitted externally authored, response-bearing item may warrant maintainer attention | Tenant-scoped count/Bird-View inclusion and later optional attention routing | Assignment, `LifecycleFrontier`, Task creation, ranking |
| Explicit canonical Task claim | One unique admitted `sourceEventId` is atomically bound to one canonical `taskId` | Existing A2A Task ownership and lifecycle contracts begin | Retroactive authority over source history or another tenant |

Per-viewer seen state is a fourth, deliberately weaker fact. It can suppress repeated presentation
for that viewer; it cannot acknowledge for another viewer, resolve the source item, or claim work.

### 1.2 Non-goals

This record creates no runtime code, schema migration, connector, MCP operation, cadence,
pagination size, retention period, TTL, steward lease, archive threshold, or wake threshold. It
does not add ordinary community activity to `LifecycleFrontier`, make Fleet a controller, turn
Golden Path into a popularity scorer, or require one transport for both local and hosted
deployments.

## 2. Decision

### 2.1 Source occurrence and attention classification

A provider adapter declares a supported resource × event-family matrix. Reconciliation is
exhaustive **within that declared matrix** and reports unsupported or degraded families rather than
implying global provider completeness.

Provider actor kind and security/content trust are independent axes:

```text
actorKind = user | bot | organization | mannequin | enterprise-user | unknown
trustTier = owner | peer-trusted | repo-trusted | external | unclassified
```

Neither axis alone decides attention eligibility, and classification does not infer policy. The
table below sets explicit v1 policy. Discussion #15139 required a bot disposition but did not
select one; this record completes #15148 AC10 with the least-authority default. Human merge of the
ADR is the authority transition for that post-graduation completion.

| Actor/source class | Source occurrence | Attention eligibility | Projection rule |
|---|---|---|---|
| Internal or rostered human/agent | Admit when needed to reconstruct supported conversation or state; may update or resolve an existing external item | Never mints new community attention | Tenant/source-relative trust still governs prose reads |
| First-time external human | Admit when in a supported family | Eligible when response-bearing | Basic eligibility is identical to a trusted repeat external human; trust affects prose projection only |
| Trusted-repeat external human | Admit when in a supported family | Eligible when response-bearing | Trust may widen explicit drill-down, never ranking or assignment |
| Bot | Admit when needed to reconstruct supported provider state | **Not attention-eligible in v1** | Reopen only with measured missed-response evidence and an ADR amendment; never infer eligibility from `bot` or trust alone |
| Organization, mannequin, enterprise-user, or unknown actor kind | Admit when required for supported state | Not attention-eligible without an explicit source-specific reviewed disposition | Fail closed for attention while preserving honest source coverage |

Stars/un-stars, forks, watches, and equivalent popularity telemetry are outside the community-event
source families. They cannot enter durable community rows, Bird View, counts, wake, or Task claim,
and no notification, webhook, Action, sync delta, or other accelerator may re-admit them.

### 2.2 Identity model

The implementation must keep these identities distinct:

| Identity | Owner and purpose |
|---|---|
| `tenantId` | Server-derived authorization boundary; never caller authority |
| `sourceInstanceId` | Neo-owned durable source FK |
| Provider host, resource kind, and provider object id | Stable external correlation, scoped by canonical provider host |
| Display locator | Mutable `owner/repo` or provider path; never the durable FK |
| `grantRef` | Optional non-secret provider grant/installation binding; may span resources and is not source identity |
| `credentialRef` | Connector-owned secret reference; never neutral registration or ledger content |
| Provider entity id | Stable issue, pull request, review, Discussion, comment, or reply identity |
| Occurrence/revision id | Immutable observed change identity; revisions do not overwrite history |
| Provider delivery receipt | Transport retry identity; not an occurrence id |
| `batchId` | Connector retry identity for one normalized admission attempt |
| Checkpoint/inventory identity | Reconciliation basis and coverage state |
| Admitted sequence/receipt | Memory-Core ordering and admission result |
| `sourceEventId` | Canonical admitted response item that can later be claimed; not any provider, revision, delivery, batch, or Task id |
| `taskId` | Existing A2A Task identity, created/bound only by the explicit claim transaction |

The server-owned neutral registration has this logical shape:

```js
{
    sourceInstanceId,
    tenantId,
    provider,
    canonicalProviderHost,
    resourceKind,
    providerResourceId,
    displayLocator,
    grantRef,
    providerCapabilities,
    registrationEpoch,
    lifecycleState // REQUESTED | PROVISIONED | ACTIVE | REVOKED
}
```

`credentialRef` remains connector-only. A provider installation/grant may span resources and is not
resource identity. Delivery receipts are not source identity. Renames update the display locator
without changing `sourceInstanceId`.

### 2.3 Registration authority: T backed by R

Memory Core owns the provider-neutral registry and its lifecycle
`REQUESTED → PROVISIONED → ACTIVE → REVOKED`. Provider connectors own grant validation and secret
binding. Only an `ACTIVE` registration whose submitted `registrationEpoch` matches current
server-owned state may admit a batch. Revocation or reprovisioning fences stale connectors without
changing the durable source FK.

Registration uses dedicated tenant-keyed operational tables. It is not:

- Knowledge Base tenant configuration or source freshness;
- AiConfig, an environment-derived registry, or a passed-through config alias;
- connector-local neutral authority;
- Native Edge Graph ontology;
- a `sharedEntity` or `visibility:'team'` record.

Every public and internal enumeration, admission, read, count, trust projection, steward lease,
wake route, and claim re-applies server-authoritative tenant/source isolation. Internal connector
enumeration is not permission for tenant callers to see another tenant's sources.

### 2.4 Provider-neutral batch admission: I baseline, K conditional

Provider connectors own credentials, API traversal, polling/webhook semantics, pagination,
rate-limit handling, provider capability interpretation, and any pre-admission acknowledgment.
Memory Core owns tenant/source verification, canonical digesting, receipts, occurrence/revision
deduplication, bounded opaque provider state, inventory hash, typed coverage, and durable history.
Memory Core never polls a provider, resolves credentials, or reads checkout-global repository
coordinates for this path.

The normalized logical batch is:

```js
{
    schemaVersion: 'community-activity-batch.v1',
    sourceInstanceId,
    resourceFamily,
    adapterSchemaVersion,
    providerStateSchemaVersion,
    registrationEpoch,
    baseCheckpointVersion,
    baseInventoryHash,
    batchId,
    observations,
    nextProviderState,
    nextInventoryHash,
    coverage
}
```

`tenantId` is absent from caller authority. Provider coordinates may be repeated only as
attestations checked against the registration. The CAS partition is
`{tenantId, sourceInstanceId, resourceFamily}`.

One serialized transaction:

1. verifies the ACTIVE registration and epoch;
2. checks the partition-scoped `batchId` receipt;
3. returns the prior result for the same Memory-Core-computed canonical digest;
4. fails closed for the same `batchId` with a different digest;
5. verifies `baseCheckpointVersion` and `baseInventoryHash`;
6. admits overlapping observations idempotently by occurrence/revision identity plus digest;
7. fails closed when the same occurrence/revision carries a different digest;
8. admits a new revision as a new immutable fact;
9. stores bounded, canonical, secret-free, prose-free provider state, inventory, coverage, and the
   receipt; then advances that partition.

Two batches from one old basis may legitimately differ as the provider changes. One CAS wins; the
other receives stale-basis/reconcile. A lease may reduce duplicate API work but is not correctness.
The contract promises idempotent admission and durable receipts, not provider exactly-once.

`nextProviderState` is opaque to Memory Core but not unvalidated: it needs an explicit schema
version, canonical JSON and size bounds, upgrade/rebaseline semantics, and a hard no-secret/no-prose
contract. Memory Core computes the digest; it never trusts a caller-supplied one.

A connector-owned durable inbox/outbox (K) is required only when the exact canonical batch cannot
be reconstructed after crash or an ambiguous admission outcome. Its deletion requires a committed
Memory-Core receipt. Replayable polling/reconciliation uses I directly; K cannot become a second
historical authority.

GraphLog may carry compactable CDC after admission. Native Edge Graph may derive relationships.
Neither is the durable community ledger. Absence from a reconciliation pass means
`deleted | inaccessible | unknown`; only explicit provider deletion/tombstone evidence may assert
`deleted`.

### 2.5 Local and hosted topology

Local and hosted connectors share the exact neutral batch/receipt contract but not one transport:

- **L — local:** the Orchestrator coordinates an in-process provider connector and advances its
  replayable acquisition state only after neutral admission succeeds.
- **M — hosted:** an independently deployed connector submits bounded batches over authenticated,
  tenant/source-scoped MCP/HTTP. Authentication does not confer source-admin authority, and the
  caller does not stamp `tenantId`.
- **N — transitional:** the first GitHub adapter may emit from the existing post-sync seam only
  while it preserves honest coverage and does not become the portable contract. It is removable.
- **O — deferred:** a neutral HTTP/queue receiver is authorized only if measured burst,
  backpressure, or scaling evidence falsifies M. It must preserve the same admission operation and
  receipt rather than add another ledger or dedup contract.

U permits source management by the authenticated subject only in an explicit local
single-user/single-tenant deployment. Hosted bootstrap uses W: deployment operators provision and
audit sources until an authoritative tenant-membership/source-admin substrate exists. V and X are
not pre-authorized; a later tenant request may never self-activate.

### 2.6 Trust, Bird View, attention, and Fleet

Automatic durable, count, hook, and wake paths are metadata/count-only. Titles, bodies, excerpts,
and other provider prose are available only through explicit tenant/source-relative trust
projection with source ids, citations, channel-separation treatment, and honest permission-loss
handling. Sanitization does not itself authorize automatic prompt delivery.

The provider-neutral community Bird View:

- reads the durable ledger rather than querying a provider as its only source;
- is cite-backed, coverage-explicit, and `notAuthority:true`;
- exposes unsupported, stale, inaccessible, and degraded source families honestly;
- cannot assign, rank, claim, resolve, or become durable storage;
- reapplies tenant/source isolation before counts or drill-down.

J is staged. First ship the Bird View plus a bounded tenant count-only projection. A tenant-scoped,
TTL-bound steward lease, wake, stale-unacknowledged fallback, or Fleet claim affordance remains
disabled until shadow measurements justify explicit thresholds. An unfilled steward role must not
make the institution permanently deaf, but that failure does not authorize all-resident broadcast.

A future Fleet community pane is read-only until it invokes the same explicit claim transaction.
Fleet process-control authority does not imply community-read or claim authority. Community
occurrences may become source-backed metrics or decision inputs, but they cannot directly change
Golden Path score, declared direction, or intent.

### 2.7 Canonical claim transition

Attention eligibility remains zero-authority. An unclaimed item stays outside `LifecycleFrontier`
and no Task exists merely because a count, Bird View, hook, wake, or Fleet surface displayed it.

Claim is a separate serialized transaction that creates one unique binding:

```text
sourceEventId -> taskId
```

The transaction either returns the existing canonical Task binding or creates exactly one binding
and Task-state event atomically. Two peers cannot independently create two winning Tasks for one
source event. Only after this succeeds do existing A2A Task ownership, response-required lifecycle,
and ADR 0035 `LifecycleFrontier` rules take over.

## 3. Option disposition ledger

This compact ledger is normative. It preserves all 24 options from Discussion #15139; later work
cannot promote a rejected/deferred option by citing only the selected bundle.

| Option | Disposition | Residual risk / revalidation trigger |
|---|---|---|
| A | **Reject as source authority.** Retain addressed notifications for their narrow purpose. | Per-viewer coalescing cannot represent repo-global occurrences. |
| B | **Reject as the whole solution; inherit as a consumer.** Bird View reads the ledger. | Measure read latency and bounded drill-down. |
| C | **Reject.** Resource/graph snapshots cannot preserve occurrence, revision, claim, or replay. | Snapshot observations require explicit loss markers. |
| D | **Superseded by H.** Polling remains a local reconciliation mechanism. | Provider API exhaustion cost remains empirical. |
| E | **Adopt only as an accelerator under H.** Webhooks may lower hosted latency. | Reordering and non-redelivery still require reconciliation. |
| F | **Defer as an optional accelerator under H.** | Repository automation must prove value across runner, fork, credential, and replay boundaries. |
| G | **Reject as authority; retain its seam through N.** | Existing sync may emit honest snapshots only; child-bounded traversal is lossy. |
| H | **Adopt.** Durable exhaustive-within-supported-matrix reconciliation is completeness authority. | Unsupported revisions/families remain explicit coverage gaps. |
| I | **Adopt as baseline durable owner.** Tenant-scoped Memory-Core CAS admission owns history; claim binds later. | Shared Memory Core is the initial consistency topology. |
| K | **Adopt conditionally for non-reconstructable acquisition only.** | Applying it to replayable polling creates duplicate durability. |
| J | **Adopt in stages.** Bird View and bounded tenant count first; lease/wake only after measurement. | Tenant-relative trust and attention amplification are hard gates. |
| L | **Adopt for local deployments.** Orchestrator-owned in-process coordination uses the neutral admission contract. | Local identity must not leak into hosted authorization. |
| M | **Adopt for hosted connectors.** Authenticated tenant/source-scoped submission uses the same contract. | Authentication must not masquerade as tenant-admin authority. |
| N | **Adopt as a removable first-adapter seam.** | Existing sync cadence/coverage may prove insufficient. |
| O | **Defer pending measured backpressure.** | A receiver must not add a second ledger, dedup contract, or unbounded prose store. |
| P | **Reject.** Activity registration must not couple to Knowledge Base config/freshness versions. | Revisit only through a separately justified migration. |
| Q | **Reject as neutral authority.** Connectors keep grants/secrets, not the sole source registry. | Adapter replacement must preserve `sourceInstanceId`. |
| R | **Adopt as neutral registry owner and consistency boundary.** | Dedicated tables must enforce tenant RLS on every path. |
| S | **Reject as sole runtime authority.** Static/GitOps input may bootstrap W only. | Config/runtime drift otherwise breaks activation epochs. |
| T | **Adopt, backed by R.** Use REQUESTED → PROVISIONED → ACTIVE → REVOKED plus epoch fencing. | Crash fencing and stale-epoch rejection require integration proof. |
| U | **Adopt only for explicit local single-user deployments.** | It grants no hosted/cloud admin power. |
| V | **Defer until authoritative tenant membership/source-admin exists.** | MCP projection metadata is not a role model. |
| W | **Adopt for hosted bootstrap.** Deployment operators provision sources. | Measure operator latency and auditability. |
| X | **Defer as a later self-service path.** | A tenant request must never self-activate and must preserve source identity. |

## 4. Mandatory implementation gates

These are merge-blocking gates for every implementation leaf, not advisory guidance:

1. **Tenant/source-relative trust first.** No prose drill-down or cross-tenant-capable projection
   ships before dedicated-table read isolation and tenant/source-relative trust are proved. No row
   uses `sharedEntity` or `visibility:'team'`.
2. **Atomic canonical claim.** No Task, `LifecycleFrontier` row, or claim affordance ships without
   one unique atomic `sourceEventId → taskId` binding.
3. **Shadow measurement first.** No cadence, pagination, retention, TTL, steward, archive, wake, or
   amplification threshold is selected before named volume/cost/latency measurements exist.

## 5. Migration and authority order

There is no dual-authority migration:

1. **ADR acceptance:** this record merges through the human gate before runtime implementation.
2. **Shadow instrumentation:** install the measurement surface first and begin with facts available
   before admission exists: candidate supported-family volume, actor/trust split, provider pages per
   candidate observation, duplicate/update/tombstone rates, and acquisition latency. Define the
   future storage, CAS, attention-amplification, steward-vacancy, and response-latency metric slots
   without inventing their thresholds.
3. **Neutral registration:** add R/T lifecycle, epoch fencing, server-derived tenant/source checks,
   and tenant-private enumeration.
4. **Neutral admission:** add I's partitioned CAS, receipt, immutable revision, coverage, opaque
   checkpoint, and absence semantics. Add K only for a proven non-reconstructable acquisition mode.
5. **Provider reconciliation:** ship GitHub first under H, using L and removable N locally; declare
   the supported family matrix and every gap. Later adapters reuse the neutral contract.
6. **Read/seen/claim:** add provider-neutral Bird View, per-viewer seen facts, and the canonical Task
   claim only after their tenant/trust/atomicity dependencies exist.
7. **Hosted delivery:** add M for independently deployed connectors; add O only after measured
   backpressure falsifies M.
8. **Attention projection:** calibrate bounded tenant counts, then consider steward lease, wake, or
   Fleet affordances only from measured thresholds and an explicit review.
9. **Authority-chain proof:** verify source → registration → admission → projection → claim → Task
   end to end, including crash/replay, revocation, tenant isolation, hostile prose, and no dual Task.

Each later primitive extends the already-shipped instrumentation in shadow-only mode before its
threshold-dependent consumer can activate: admission adds storage/CAS metrics; count projection
adds bytes and amplification; claim adds time-to-ack/claim/response; a steward experiment adds
vacancy and wake-cost evidence. “Instrumentation first” therefore governs every phase rather than
pretending pre-admission code can measure post-admission behavior.

The live Epic dependency graph owns exact ticket edges. This record owns the semantic order so
ticket renumbering cannot change authority.

## 6. Existing ADR relationships and reopen triggers

| Existing record | Boundary retained | Reopen trigger |
|---|---|---|
| ADR 0015 | Initial durable admission uses one Memory-Core-owned SQLite/WAL consistency boundary. The new operational tables do not imply Native Edge Graph ownership. | Horizontal multi-writer, replicas, cross-pod failover, or a deployment without one shared Memory-Core transaction boundary. |
| ADR 0019 | Source registration and checkpoint state are runtime operational records. AiConfig may provide deployment settings at the consumer use site but cannot become the registry, copy secrets, derive tenant/source identity, or carry mutable admission state. | A proposed configuration change that cannot preserve one reactive provider SSOT and the operational-state boundary. |
| ADR 0035 | Community history is durable source state; Bird View/count/hook/wake are zero-authority projections. Unclaimed activity stays outside `LifecycleFrontier`; only post-claim Task facts enter. | Any proposal to make community projection durable truth, ranking authority, implicit assignment, or lifecycle admission before canonical claim. |

Additional empirical revalidation triggers:

- **K:** an acquired canonical batch cannot be reconstructed after crash or ambiguous admission;
- **O:** M cannot satisfy measured burst/backpressure/scale needs;
- **V:** an authoritative tenant-membership/source-admin substrate exists;
- **X:** measured self-service demand justifies request/provisioning without self-activation;
- **H:** a provider cannot exhaust a required family or stable revision identity; the unsupported
  surface must be excluded explicitly rather than silently approximated;
- **bot attention:** measured missed-response evidence justifies an explicit ADR amendment;
- **popularity telemetry:** any proposal to admit it requires an ADR amendment and cannot arrive via
  an accelerator shortcut;
- **liveness:** if the benched Gemini family returns while Epic #15145 remains active, seek its
  version-bound review of any still-unmerged or amended high-blast authority; prior silence is not
  implicit consent.

## 7. Consequences

### Positive

- Local and hosted deployments share one provider-neutral historical authority without sharing one
  transport or credential model.
- Missed delivery does not equal permanent deafness; reconciliation and explicit coverage own
  completeness.
- Tenant isolation, trust projection, and claim authority are visible architectural gates rather
  than downstream implementation details.
- Bird View, count, hook, wake, Fleet, and Golden Path consume evidence without becoming ledgers,
  rankers, or assignment systems.
- Every deferred option has a falsifiable reopen condition, preventing speculative infrastructure.

### Costs and residual risk

- Dedicated tenant-keyed tables, replay receipts, immutable revisions, source registration, and
  connector reconciliation add real operational complexity.
- Provider APIs differ in cursor, edit/delete, permission-loss, and replay semantics. Coverage must
  stay typed and honest rather than normalized into a false universal event stream.
- The v1 bot default may hide a response-worthy automation message; measurement and explicit
  amendment, not inferred trust, is the safe correction path.
- The single-Memory-Core transaction boundary is intentionally not a horizontal HA design.

## 8. Provenance, signal, and implementation authority

Normative archaeology:

- [Discussion #15139](https://github.com/orgs/neomjs/discussions/15139), graduated body anchor
  `updatedAt 2026-07-14T04:49:30Z`;
- [Grace's Step 2.5 sweep](https://github.com/neomjs/neo/discussions/15139#discussioncomment-17631120),
  whose three partials are §4's mandatory gates;
- [GPT author-family signal](https://github.com/neomjs/neo/discussions/15139#discussioncomment-17631283);
- [Grace's Claude non-author-family approval](https://github.com/neomjs/neo/discussions/15139#discussioncomment-17631315),
  bound to the same body version.

Signal Ledger at graduation:

| Family | Signal | Version binding |
|---|---|---|
| GPT | `AUTHOR_SIGNAL` by @neo-gpt | `2026-07-14T04:49:30Z` |
| Claude | `GRADUATION_APPROVED` by @neo-opus-grace | `2026-07-14T04:49:30Z` |
| Gemini | `operator_benched`; archived as unresolved liveness, not consent | Revalidation trigger in §6 |

### 8.1 Discussion criteria mapping

| Graduated criterion | Executable authority in this record |
|---|---|
| OQ1 — event and actor classification | §2.1 separates occurrence, attention, actor kind, trust, excluded telemetry, and the explicit v1 bot disposition. |
| OQ2 — source completeness | §2.1 and H in §3 require exhaustive reconciliation within a declared supported matrix plus honest gaps. |
| OQ3 — identity and replay | §2.2 and §2.4 keep registration, provider entity, occurrence/revision, delivery, batch, checkpoint, receipt, sequence, source-event, and Task identities distinct. |
| OQ4 — durable owner | §2.3–§2.4 select tenant-scoped Memory Core and exclude GraphLog/Native Edge Graph as history. |
| OQ5 — seen, claim, and resolve | §1.1, §2.6, and §2.7 keep seen zero-authority and require one canonical atomic claim. |
| OQ6 — Bird View | §2.6 fixes provider-neutral, cite-backed, coverage-explicit, `notAuthority:true` reads. |
| OQ7 — hook, wake, and Fleet | §2.6 stages count-first J and keeps wake/Fleet read-only until measurement and claim. |
| OQ8 — trust and privacy | §2.1, §2.3, and §2.6 require tenant/source-relative projection, metadata-only automatic paths, and dedicated-table isolation. |
| OQ9 — topology and portability | §2.3–§2.5 select R/T, L/M, transitional N, local U, hosted-bootstrap W, and defer O/V/X. |
| OQ10 — density, retention, and cost | Gate 3 in §4 and phase 2 in §5 make named shadow measurements the first code authority. |
| Step 2.5 partials | All three are normative merge gates in §4. |
| 24-option convergence | Every option and residual trigger is retained in §3. |

There was no unresolved substantive dissent at graduation. The operator's timing waiver closed the
window question without changing the selected architecture.

Human merge of this ADR is the implementation-authority transition. This PR remains docs-only.
The first runtime leaf is shadow instrumentation, and every later leaf remains gated by the live
Epic dependency graph, the contracts above, and cross-family review.
