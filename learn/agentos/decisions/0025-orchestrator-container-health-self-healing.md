# ADR 0025: Orchestrator Container-Health Diagnostics Daemon

> Architectural Decision Record for the **detect + diagnose half** of a deployment-wide **immune system**: an orchestrator-resident daemon that observes sibling-container health (resource saturation, contention, config-correctness, lifecycle state), maps symptom→cause→**action class**, and emits a **diagnosis** — which the recovery actuator (**ADR-0026**, the complementary *act* half) consumes. The load-bearing decision is the separation of **detect signal** from **actuator authority**: a healthcheck is an input, never a heal trigger. A self-evolving digital organism (`README.md` L16) currently has **no deployment-level immune response** — a sibling container can saturate or starve while the orchestrator reports green, with nothing to detect, diagnose, heal, or even escalate. This ADR (diagnostics) and ADR-0026 (recovery) are the **map ↔ world-atlas** pair: each governs one half; together they are the self-healing organism. *(Originally drafted pre-split as the whole organism; the actuator model in §2.2–§2.3 is now canonical in ADR-0026, which inherits it — see the §2 scoping note.)*

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-06-22 (design sub of Epic #13860; cross-family `/peer-role` design-pressure converged with @neo-gpt; pending ADR-PR re-poll + §6.2 family-keyed quorum at graduation. Human merge gate per ADR-0005 lifecycle.) |
| **Amended** | 2026-06-26 (#14191, full-self-heal) — the **escalate-with-diagnosis (page)** terminal (the §2.3 envelope, the alarm-only line, the §2.4 diagnose-map's `config-drift` / `data-integrity` routes, AC-7) is superseded by **record-with-diagnosis (durable async-audit to the heal-event ledger `healEventLedgerStore`, #14163) + autonomous action**: an operatorless cloud has no human to page (@tobiu's directive — epic #14039 / #14132). `data-integrity` routing is now governed by ADR-0027 (autonomous data-recovery). The never-loop discipline, the persisted anti-thrash envelope, and the two-worlds config-lifecycle-only safety (AC-5) are **unchanged**. |
| **Author** | @neo-opus-grace (Grace, Claude Opus 4.8) body-driving; design converged with @neo-gpt (Euclid, GPT family) via cross-family `/peer-role` on #13861 — the detect/actuator separation, the 3-column actuator matrix, the persisted anti-thrash state, and the multi-fact detect model are his pressure, accepted |
| **Resolves** | #13861 — *"Container-health daemon: design / ADR (actuator privilege + heal-safety + false-positive-safe detect)"* |
| **Parent epic** | #13860 — *"Orchestrator container-health self-healing daemon"* (the deployment-wide detect→diagnose→heal→escalate loop) |
| **Depends on** | ADR-0019 (config SSOT — every tuning leaf extends an existing `leaf()`), ADR-0020 (agent-harness — the orchestrator is the daemon's home), ADR-0009 (cross-daemon lease — the heal-attempt state reuses the orchestrator's durable persistence layer), the **two-worlds safety model** (cloud-tier = config + lifecycle ONLY, never code-exec/dynamic-import) |
| **Connects to** | **ADR-0026** (the recovery actuator — the *act* half that consumes this ADR's diagnosis; mutual map↔world-atlas reference), #13435 (healthcheck-auth boundary — container-health must **not** smuggle auth/privilege changes via an implementation sub), #13852 (config-side local-model resource caps — the complementary *prevention* mitigation, distinct from this *response* layer), the `self-repair` skill (local-dev/MCP-scoped predecessor this generalizes) |
| **Implemented by** | gated on this ADR: **[detect]** the deployment-wide container-health model · **[diagnose]** the symptom→cause→action-class mapping (subs of #13860). The **[act]** actuator + **[deploy]** actuator-handle wiring are governed by **ADR-0026** (Epic #13874). |
| **Anti-anchor for** | `healthcheck == actuator` (a probe is signal, never authority); **in-memory** heal-attempt tracking (an orchestrator restart erases the cap → the forbidden thrash loop); arbitrary code-exec / dynamic-import as a heal action; restarting a functionally-healthy container on a single advisory canary fail |

---

## 1. Context

Neo is a self-evolving digital organism (`README.md` L16) with a Brain, a Swarm, and a Body — but **no deployment-level immune response**. Three substrate facts, audited at `dev`, motivate this ADR:

1. **The orchestrator's existing watchdogs are per-*task* liveness, not deployment-*health*.** The consolidation-liveness watchdog (#13818) and the heavy-maintenance-lease watchdogs (#13755 / #13624) observe whether *orchestrator tasks* make net progress. None observe whether a **sibling container** (memory-core, knowledge-base, the local-model server) is saturating, starving, or mis-configured. The orchestrator can report "green" while a sibling degrades.

2. **`ProcessSupervisorService` supervises *in-process children*, not sibling containers.** It owns child-process lifecycle + provider-readiness within the orchestrator process; it has no runtime handle to a sibling container and no health model for one. The new daemon is its sibling-container analogue, and the **actuator handle is the hard design decision** (§2.2).

3. **The `self-repair` skill is local-dev / MCP-scoped.** It heals an interactive dev harness; it does not run unattended in a deployment, has no resource/contention model, and is not an actuator over sibling containers.

The generic failure class this answers: a deployment's local-model container saturates its CPU cap, and a co-scheduled embedding model starves behind a chat model on the shared cap (the contention / parallel-slot class — the #13700 `lms --parallel` twin). The container flips healthy→unhealthy; **nothing detects, diagnoses, heals, or escalates it.** The organism has no immune system, and the human-repair path may itself be unavailable. This ADR is the **response** layer; #13852 (config-side resource caps) is the complementary **prevention** layer — both are needed, neither substitutes for the other.

**Substrate audited at `dev`:** `ai/daemons/orchestrator/services/{ProcessSupervisorService,HealthService}.mjs`, `ai/daemons/orchestrator/scheduling/*Watchdog*.mjs`, `ai/deploy/docker-compose*.yml` (services carry `healthcheck` + `depends_on` but **no `restart:` policy and no docker-socket mount**), `.agents/skills/self-repair/`.

## 2. Decision

> **Post-split scoping note (#13880).** This ADR was first drafted as the *whole* self-healing organism. On the two-daemon split (Epic #13860 diagnostics ↔ Epic #13874 recovery), it is now the **diagnostics** half: §2.1 (detect ≠ actuator) and §2.4 (the detect model) are its canonical content. The actuator sections **§2.2 (privilege matrix)** and **§2.3 (heal-safety envelope)** originated here but are now **canonical in ADR-0026** (the recovery half), which inherits them via its §2.1 successor-risk audit and extends them with privilege-tiering (B0/B1) and the controller-agnostic interface. They are retained below for historical continuity; **forward edits to the actuator model go to ADR-0026, not here.** The actuator graduation ACs (former AC-2/3/5/6/7) likewise have their forward home in ADR-0026 §2.6. *(Whether to physically relocate §2.2–§2.3 out of this file or keep this governed pointer is **OQ-4** for the cross-family review.)*

### 2.1 The load-bearing principle: detect-signal ≠ actuator-authority

A healthcheck / probe is a **signal input**, never a **heal actuator**. The compose `healthcheck` reports a container `unhealthy`; it does **not** restart an unhealthy-but-*running* sibling. Conflating the two — `healthcheck == actuator` — is **rejected**, and the ADR records that rejection explicitly (AC-1).

This is not pedantry — it is forced by a live property of this system: **memory-core's A2A and memory-saves no longer block on the chat/embedding model.** A probe modelled on an embedding canary can therefore **false-fail while memory-core is functionally fine** (the canary times out on model contention; the service still answers A2A and persists memory). Restarting a working container on that canary is a *self-inflicted outage*. Therefore: **heal on resource/contention reality plus multi-fact evidence (§2.4), never on a single probe verdict.**

### 2.2 The actuator divergence matrix — privilege is the hard decision

The daemon's *decision* logic lives in the orchestrator (operator-agreed shape: the daemon is orchestrator-resident; if the orchestrator dies there is no heal — see AC-7). The *actuator* — the runtime handle that can restart a sibling — is the privilege boundary. Three options, each retained **only with its falsifier**:

| Option | What it can actually do | Falsifier (drops the option) |
|---|---|---|
| **(a) Docker-socket + constrained wrapper** | Orchestrator mounts the runtime socket; a strictly **allowlisted** wrapper restarts named services, inspects state, emits a diagnosis | The wrapper can address a **non-allowlisted** container or action, **or** cannot distinguish service identity → reject (it is then an unbounded runtime grant, not a constrained actuator) |
| **(b) Minimal privileged sidecar** | A separate tiny container owns the runtime handle; exposes a **lifecycle-only** internal API the orchestrator calls; the orchestrator never holds the socket | The sidecar API grows **beyond lifecycle** (exec/arbitrary), **or** its auth is **weaker** than the socket option → reject |
| **(c) Runtime-native restart** | The container runtime restarts/heals an unhealthy sibling **without** granting the orchestrator any runtime access | **The current compose/runtime only *reports* unhealthy or gates *startup* — it does not restart an unhealthy-but-running sibling.** Until that is *proven* (a runtime that restarts on unhealthy **and** an orchestrator-observable outcome), (c) is **detection / startup-gating only, not an actuator.** |

**Recommendation (for the re-poll, not yet final):** **(a) for the MVP** — pragmatic, fewest moving parts, the safety living in auditable allowlist-wrapper code — **with (b) as the documented hardening path** if socket-in-orchestrator privilege proves too broad. **(c) is rejected as an actuator** on its falsifier (it remains a valuable *detect* input). The decision is falsifier-gated: if (a)'s wrapper cannot be *proven* strictly-allowlisted + identity-distinguishing, it drops to (b). This is OQ-1 for the cross-family re-poll.

### 2.3 Heal-safety: a bounded state machine with **persisted** anti-thrash state

The heal loop is a strict, non-looping state machine:

> **observe → classify → ONE bounded lifecycle action → cooldown → re-observe → record.** Never an action loop, never a blocking page.

The thrash-impossibility argument is **mechanical**, not aspirational:

- A **per-service token bucket** + **max-attempts-per-time-window** + **exponential backoff**, after which the service hard-transitions to **alarm-only** (durable async-record, never act, never page).
- **The anti-thrash state is persisted OUTSIDE process memory.** This is the decision's sharpest edge (@neo-gpt's catch): the daemon is orchestrator-resident, and **an orchestrator restart would erase an in-memory attempt cap — recreating exactly the loop this ADR forbids** (heal → orchestrator churns/restarts → cap lost → heal again → …). The cap is durable or it is not a cap.
- **Named location:** a dedicated `heal_attempts` record (service-key → window-start, attempt-count, last-action, backoff-until) in the **orchestrator's durable harness-state store** — the same persistence layer the cross-daemon lease (ADR-0009) and harness-state already use, **not** process memory. Concrete file/table binding is confirmed in the **[act]** sub (OQ-2), but the *invariant* — survives an orchestrator restart — is fixed here.

Every heal action is **config + lifecycle only** (restart / throttle / reconfigure / shed-load), **reversible**, and **never** code-exec or dynamic-import (the two-worlds safety boundary; AC-5).

### 2.4 The false-positive-safe detect model

- **A single failed probe is *advisory*.** An **authoritative** restart requires **≥ 1 resource or lifecycle fact beyond a single canary** — e.g. `container-unhealthy state` **+** a failed *direct* endpoint probe, **or** `resource-exhaustion` (sustained, sampled over time) **+** a sustained failed service operation.
- **Model-dependent canaries classify as "contention / degraded" *first*, never "restart now."** The embedding-canary false-fail (§2.1) is the anchoring example: contention is throttled/shed (or recorded when un-healable), not restarted-through.
- **Detect signals, per container:** memory %, CPU load **sampled over a window** (not a single snapshot — a momentary spike ≠ saturation), env-var / **config-correctness** (catches the "intended override not applied" class — a config-drift fault no resource probe sees), container-health state, a direct endpoint probe.
- **Detect signals, data-integrity** *(amendment 2026-06-26, #14089 — the detect model extends beyond container-health into data-correctness; first shipped in #14075):* container liveness ≠ data health — a container can be *up + responsive but data-gutted* (the #13999 ~60% Memory-Core vector-loss that went undetected for weeks precisely because §2.1 treats memory-core as healthy while it "answers A2A and persists memory"). The first shipped signal is per-collection **vector-coverage drift** (`buildDataIntegrityCoverageDiagnosis` — `metadataRowCount` vs `vectorIndexIdCount`); the follow-on heuristics (MC vector-count monotonicity, cross-collection MC-vs-KB sanity, store-bloat, exportability canary, SQLite `integrity_check`) and the **scheduled wiring** into the diagnostics daemon are deferred to #14026. The merged #14075 is the **pure** detect→diagnose producer; scheduling it is the follow-on.
- **Diagnose** maps symptom→cause into the action class: *transient-crash* → restart; *contention/saturation* → throttle/shed; *config-drift* → the autonomous lifecycle action (reconfigure / redeploy within the envelope), **recorded** with its diagnosis when un-resolvable (never a blocking page); ***data-integrity drift* → autonomous data-recovery** (`recoveryClass: 'data-integrity'` → the runner-classifier + the ADR-0027 actuator: heal / freeze / settle; **escalate removed** — superseded by ADR-0027 §2.2, which moved data mutation from operator-gated to bounded-autonomous). *(Amended 2026-06-26, #14191 — the original `config-drift` / `data-integrity` → `escalate-with-diagnosis` (page) routes are full-self-heal-superseded; data-integrity now routes per ADR-0027.)* A single coverage-drift fact at `confidence: 1` **records** (not pages) at that confidence because a record is non-authoritative: the multi-fact requirement above gates authoritative *actions*, not records.

### 2.5 Binding constraints (graduation ACs)

- **AC-1 — detect ≠ actuator.** The ADR explicitly rejects `healthcheck == actuator`; a probe is signal, authority is the §2.2 actuator.
- **AC-2 — actuator matrix with falsifiers.** The 3-column matrix stands; runtime-native (c) is rejected as an actuator unless its falsifier is disproven.
- **AC-3 — persisted anti-thrash state.** The §2.3 state machine + the **named, process-memory-external** heal-attempt store + the mechanical thrash-impossibility argument are binding.
- **AC-4 — false-positive-safe detect.** Probe-alone stays advisory; authoritative action needs multi-fact evidence; model canaries classify contention-first.
- **AC-5 — two-worlds safety.** Every heal action is config + lifecycle only, reversible, N-capped; never code-exec / dynamic-import.
- **AC-6 — no privilege smuggling.** Container-health must not alter healthcheck-auth (#13435) via an implementation sub; the actuator handle is the *only* privilege this epic introduces, and it is governed here.
- **AC-7 — orchestrator-SPOF, accepted + documented.** The daemon is orchestrator-resident; if the orchestrator dies there is no heal — and the durable record is itself orchestrator-resident, so a dead orchestrator records nothing (the cloud's orchestrator-restart is the recovery; #14191). This is the operator-accepted caveat, recorded so a future agent does not "fix" it by granting the actuator a second independent home without re-opening the privilege decision.

## 3. Considered alternatives (rejected)

- **`healthcheck == actuator`** — restart on the probe verdict. Rejected (§2.1): the canary false-fails while the service is fine → self-inflicted outage.
- **Extend the `self-repair` skill** to the deployment. Rejected: local-dev/MCP-scoped, interactive, no resource model, no unattended actuator — a different shape, not a reach extension.
- **Reuse the per-task watchdogs as health.** Rejected: task-liveness ≠ container-health; a watchdog seeing task progress is blind to a starving sibling.
- **In-memory / unbounded heal-attempt tracking.** Rejected (§2.3): the orchestrator-restart-erases-the-cap loop.

## 4. Open questions (for the cross-family re-poll)

- **OQ-1 — actuator privilege:** (a) socket+wrapper MVP vs (b) sidecar — the §2.2 falsifier-gated decision.
- **OQ-2 — persisted-state binding:** the exact `heal_attempts` table/file in the orchestrator's durable store (confirmed in **[act]**; the survives-restart invariant is fixed).
- **OQ-3 — authoritative-evidence thresholds:** which multi-fact combinations cross advisory→authoritative, and the resource-sampling window.

## 5. Consequences

The organism gains a bounded immune response: a degrading sibling is detected on resource reality, diagnosed to an action class, healed within a thrash-proof envelope, or **recorded** *with a diagnosis* when un-healable (a durable async-audit, never a blocking page to a nonexistent cloud operator; #14191) — replacing a silent green-while-rotting deployment with an observable, self-correcting one. The cost is one new privilege (the actuator handle), confined to config+lifecycle, governed by this ADR, and gated by cross-family review before any implementation sub merges.
