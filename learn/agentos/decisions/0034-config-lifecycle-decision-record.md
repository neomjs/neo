# ADR 0034: Config Lifecycle - blast tiers, deployment-class shifts, and controller actuation bounds

> Architectural Decision Record for Epic #14564's first leaf (#14671). This record is the
> authority every self-configuring Agent OS implementation leaf cites before it changes config
> behavior: the T0-T3 blast-tier taxonomy, the `deploymentClass` shift rule, the dual-semantic
> range and delegation-sentinel clauses, and the per-controller actuation bounds that keep the
> config plane inside ADR 0019's Provider SSOT.

| Attribute | Value |
|---|---|
| **Status** | Proposed - 2026-07-05 (transitions to Accepted on approved, green PR merge at the human merge gate, per ADR 0005 lifecycle) |
| **Author** | @neo-gpt (Euclid, Codex Desktop), grounded in Discussion #14456, Epic #14564, and live ADR/source V-B-A at `dev` |
| **Resolves** | #14671 - "Config-lifecycle Decision Record: blast-tier taxonomy + per-controller actuation bounds" |
| **Graduated from** | Discussion #14456 - "Self-configuring Agent OS"; quorum met 2026-07-04 with @neo-gpt `[GRADUATION_APPROVED]` and the author fold to Epic #14564 |
| **Governs** | Config-lifecycle leaves under Epic #14564: measurement harnesses (#14672/#14676), `deploymentClass` probing (#14673), overlay inheritance and drift-heal leaves (#14674/#14675), and later tier/measurability/controller leaves |
| **Depends on** | ADR 0019 (AiConfig Provider SSOT and B4 no runtime singleton mutation), ADR 0025/0026/0027 (detect/actuate/data-world separation), ADR 0031 (composition seam table), #14430/#14442 (metric provenance), #14230 (fork-to-PR outcome contract) |
| **Decision Record impact** | aligned-with ADR 0019/0026/0027/0031; introduces the config-lifecycle controller/tier authority consumed by future leaves; does not amend the Provider primitive itself |
| **Anti-anchor for** | silent config auto-writes, self-licensing enable switches, T1 ranges that cross disable semantics, inferred null delegation, runtime mutation of the shared `AiConfig` singleton, CI-only drift detection, and three blind controllers over one config plane |

---

## 1. Context

Neo's Agent OS already has recovery loops for process health (ADR 0025/0026), data health
(ADR 0027), and bounded serving sweet-spot tuning (#14418). The config plane remained a
hand-managed static artifact: operators copy templates into overlays, run migration scripts, and
hand-reconcile new leaves. Discussion #14456 established that this is not a documentation problem.
The lived failures happened with docs and scripts present: a local `config.mjs` repair on
2026-05-10, a Codex install/config denial wall on 2026-07-02, and an operator overlay missing newer
template leaves until runtime failed loud.

The accepted v1 shape is **measurement-first E -> A+C**:

- **E: measure first.** A timed fresh-install harness must produce TTFP, time-to-first-PR, and
  config-touch-count before any self-configuration work claims an adoption win.
- **A: install-time detect-and-propose.** The install path detects the deployment situation and
  proposes a template-derived overlay delta for human confirmation.
- **C: drift-heal by proposal.** Template/overlay drift is detected where it bites, at local-dev
  preflight, and reconciled as reviewed deltas.
- **B: runtime tuning is deferred.** It comes only after measurable T1 leaves, the coordinator
  contract for multiple controllers, and ADR-0019-safe session/next-boot actuation bounds.

This ADR records the tier and controller authority so implementation PRs do not re-argue it or
smuggle runtime mutation through "helpful" automation.

## 2. Decision

### 2.1 The actuation tiers travel with config leaves

Every configurable leaf that can be touched by the self-configuring Agent OS must have an explicit
actuation tier. The tier belongs to the leaf declaration or to an ADR-0019-native metadata record
owned by that leaf; a detached guide table is not enough.

| Tier | Gate | Defining property | Examples and boundaries |
|---|---|---|---|
| **T0 - detect-only** | no config actuation | identity-bearing, trust-bearing, secret-adjacent, or security-sensitive values where a wrong value is a security or identity event | auth modes, allowed hosts, public URLs, API keys, credentials, tenant identity facts |
| **T1 - auto-within-envelope** | bounded automatic moves, no per-move human confirmation | outcome-measurable, reversible by construction, local blast radius, and inside a declared safe envelope | cadences, batch sizes, thresholds, and decay parameters after their metric and envelope exist |
| **T2 - propose-and-confirm** | machine proposes, human confirms before landing | deterministic-detectable but sticky, cross-substrate, expensive to reverse, or guest-substrate-affecting values | provider choice, endpoints, ports, vector dimension, storage paths, overlay deltas |
| **T3 - human-only** | never set by machinery | policy, intent, license, or enablement values where the value itself is an operator decision | master enables, debug/transport posture, metric-probe enables, self-licensing switches |

Fail closed: an untiered leaf is T3 until a later PR declares and proves a narrower tier. The future
`leaf()` tier slot and lint extension are implementation leaves; this ADR defines their semantics.

### 2.2 `deploymentClass` shifts the tier, never the hard boundary

The install probe's first fact is `deploymentClass`. The current authority names:

- `agent-os-on-own-repo`
- `agent-os-on-tenant-repo`
- `agent-os-cloud-tenant`
- `undetermined` as the restrictive fallback for the detector leaf (#14673)

The tier table in §2.1 is the `own-repo` column. For `tenant-repo`, `cloud-tenant`, and
`undetermined`, every T1 auto action shifts to T2 propose-and-confirm. T0 and T3 stay unchanged.
Guest substrate is propose-only even when a value would be locally reversible in Neo's own checkout.

This rule prevents a self-configuring local install from quietly becoming a self-writing tenant or
cloud deployment.

### 2.3 Dual-semantic ranges cannot smuggle enable switches into T1

Some numeric leaves are tunable ranges and enable switches at the same time. Discussion #14456
verified the live class in `ai/config.template.mjs`: watchdog cadences using `<= 0` to disable a
lane, and `orchestrator.chroma.maxRuntimeMs` using `0` to disable recycling.

For a T1 range with disable semantics:

1. the leaf must declare an envelope that excludes the disable region;
2. any proposal or action crossing into the disable region escalates out of T1;
3. a dual-semantic leaf without declared bounds defaults to T2, not T1;
4. a dedicated enable remains T3 unless §2.4's delegation rule applies.

No controller may self-disable the immune system by walking a cadence or duration across a hidden
disable boundary.

### 2.4 Delegation sentinels are schema-declared, never inferred

A T3-adjacent leaf may delegate resolution only when the schema explicitly declares that sentinel.
The canonical live example is `orchestrator.devServer.enabled: null`, where `null` means the
deployment profile resolves the value. The installer may honor that declared delegation; it may not
infer delegation from an arbitrary missing, null, empty, or default value.

Required properties:

- the sentinel must be named at the leaf schema/metadata level;
- the resolver must cite the evidence it used, including `deploymentClass` when relevant;
- the resolved value is a proposal or pre-SSOT install output, not a runtime mutation of the shared
  `AiConfig` singleton.

### 2.5 Controller actuation bounds

The config lifecycle has three controller families over one knowledge plane. They must not act as
blind peers.

| Controller | Allowed actuation | Hard boundary |
|---|---|---|
| **Install-time detector/proposer (A)** | writes a template-derived overlay before the SSOT singleton is live, or emits a confirmed overlay delta | no tenant/cloud auto-write; no credential reads; no hidden defaults; proposal scope is T2, T1 initial values, and schema-declared sentinels |
| **Drift-heal reconciler (C)** | emits reviewed PR-shaped deltas or local-dev preflight findings with source evidence | detects locally where stale overlays bite; never rewrites silently; never mutates runtime config |
| **Runtime tuner (B)** | session-scoped override layer or next-boot durable overlay delta, after measurement and coordinator gates exist | B4 is inviolate: no runtime mutation of the shared `AiConfig` singleton, ever |

The second active controller over the same leaf class is gated by a coordinator contract. That
contract must define ownership, priority, cooldown, and observation semantics before the second
controller can merge. Until then, B remains deferred, and A/C leaves must make their limited scope
explicit.

### 2.6 Provenance is part of the value contract

Every self-set or self-proposed value carries ADR-0019-native provenance:

```json
{"why": "...", "when": "ISO-8601 timestamp", "source": "...", "evidence": "..."}
```

The exact storage shape is an implementation detail for later leaves, but the obligation is not. A
value without a falsifiable reason and evidence is invalid for self-configuration. This mirrors the
#14430 `falsifyingQuery` discipline and makes config-touch-count and TTFP claims auditable rather
than rhetorical.

### 2.7 Measurement comes up before machinery claims success

Measurement-first is binding. The timed install harness (#14672) and first-durable-memory terminus
(#14676) are not polish around A/C; they are the falsifiers for adoption claims. No self-config PR
may claim TTFP improvement, fork-to-PR improvement, or config-touch-count reduction unless the
measurement surface exists or the PR explicitly limits itself to building that surface.

## 3. Rejected alternatives

| Alternative | Rejection |
|---|---|
| Static tooling only | The lived drift corpus happened with scripts and docs already present; static guidance cannot own the lifecycle. |
| One-shot install wizard without drift-heal | Improves day zero, then rots. A proposal that stops observing its substrate becomes stale authority. |
| Runtime tuner first | Most config values are not outcome-measurable, and a second controller over the same Provider tree recreates the #13873 arbitration problem. |
| Silent tenant/cloud auto-write | Violates the guest-substrate trust boundary; tenant/cloud and undetermined deployment classes are propose-only. |
| CI-only drift detection | The stale-overlay class fails in local operator config while CI re-materializes from the template. The detector must fire at local-dev preflight. |
| Side log for provenance only | Provenance must travel with the config value or an ADR-0019-native metadata path; otherwise the value and its evidence drift apart. |

## 4. Consequences

**Positive:** implementation leaves can cite one authority for tier semantics, deployment-class
shifts, range/sentinel edge cases, and controller actuation. The next leaves can build measurement,
probe, overlay, and drift-heal mechanics without renegotiating safety in every PR.

**Negative / accepted costs:** leaf declarations or leaf metadata become heavier because tiers,
envelopes, sentinels, and provenance must be explicit. That is intentional: implicit config
authority is the failure class.

**Merge-order effect:** #14672/#14676 may build the measurement floor, #14673 may build
`deploymentClass`, and #14674/#14675 may build overlay/drift mechanics after this ADR is accepted.
Any B/runtime-tuning leaf remains gated behind measurement plus the coordinator contract.

## 5. Re-review triggers

Re-open this ADR, or file an explicit amendment, when a PR:

1. adds or changes a config controller;
2. changes the `deploymentClass` vocabulary or the tenant/cloud tier-shift rule;
3. changes `leaf()` tier, envelope, sentinel, or provenance metadata semantics;
4. proposes runtime mutation of `AiConfig` or any shared Provider singleton;
5. allows tenant/cloud auto-write;
6. changes the measurement-first ordering for TTFP, time-to-first-PR, or config-touch-count;
7. introduces a second active controller over a leaf class without the coordinator contract.

## 6. Source and consensus ledger

| Family | Identity | Signal | Anchor |
|---|---|---|---|
| Anthropic (Claude) | @neo-fable-clio | `[AUTHOR_SIGNAL]` and graduation fold | Discussion #14456 body, 2026-07-04 |
| Anthropic (Claude) | @neo-fable | OQ4 / Option E divergence input | Discussion #14456, 2026-07-02 |
| Anthropic (Claude) | @neo-opus-grace | OQ2/OQ3 ADR-0019 expert input, same-family disclosure | Discussion #14456, 2026-07-02 |
| OpenAI (GPT) | @neo-gpt | `[GRADUATION_APPROVED]` constrained-v1 epic shape | Discussion #14456, 2026-07-04 |

**Unresolved dissent:** none. **Unresolved liveness:** Ada/Vega were Opus-benched during the
divergence window; Gemini was operator-benched. Material edits to this ADR or to the config
controller/tier model should re-poll any reactivated family.

## 7. Related

Discussion #14456; Epic #14564; #14671; #14672; #14673; #14674; #14675; #14676;
ADR 0019; ADR 0025; ADR 0026; ADR 0027; ADR 0031; #14230; #14418; #14430; #14442.

Origin Session ID: 6ab85930-3c14-4b18-b3b3-97989d1e75c6
