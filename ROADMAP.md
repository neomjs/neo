# Neo.mjs Project Roadmap

The roadmap holds the **next-release scope only** — what ships next and why. Everything else has a canonical home:

- **Vision & positioning:** [`.github/VISION.md`](.github/VISION.md)
- **Architecture:** [Architecture Overview](learn/benefits/ArchitectureOverview.md) · [The Dream Pipeline & Golden Path](learn/agentos/DreamPipeline.md)
- **Shipped history:** the [release notes](resources/content/release-notes/) ([v13.0.0](resources/content/release-notes/chunk-2/v13.0.0.md)) + the v13 architectural path ([`learn/agentos/v13-path.md`](learn/agentos/v13-path.md))

## Next: v13.1 — Agent OS Stability & Self-Healing

v13 proved the institution; **v13.1 makes the institution safe to leave running.** The release gate is a single, honest bar:

> **A corruption injected in test is detected, diagnosed, dated, and recovered — or escalated with a concrete recovery plan — before a failed backup is the first signal.** The Agent OS can prove the Memory Core is exportable, the backup is restorable, the data-integrity diagnostics fire, and the Sandman handoff substrate is again trustworthy.

The release thesis changed because the organism surfaced real friction: the #13999 Memory Core incident showed that a green harness can still be data-gutted, and the roadmap must follow verified reality rather than a stale product promise. v13.1 is therefore the stability and self-healing release for the Agent OS: it closes the data-integrity blind spot, restores backup confidence, and turns the ADR 0025/0026 immune-system work into a release-grade safety loop. The live scope-map is [Epic #14039](https://github.com/neomjs/neo/issues/14039)'s relationship graph plus [milestone #8](https://github.com/neomjs/neo/milestone/8); this section names the gate and load-bearing path, not a frozen checklist.

**The load-bearing path — what must resolve for the gate:**

| Cornerstone | Anchor | Done signal |
|---|---|---|
| **Recover the live corpus** — the #13999 loss is repaired without weakening fail-loud backup semantics | [#13999](https://github.com/neomjs/neo/issues/13999) · [#14020](https://github.com/neomjs/neo/issues/14020) · [#14023](https://github.com/neomjs/neo/issues/14023) | canonical Memory Core backup completes with row-count parity and no hidden skipped-vector success |
| **Date and explain corruption fast** — a repeat incident is localized by diagnostics instead of hand-reconstructed days later | [#14024](https://github.com/neomjs/neo/issues/14024) · [#14027](https://github.com/neomjs/neo/issues/14027) | the 06-18→06-20 loss path is classified or the next falsifier is public |
| **Detect data loss while the system is still green** — ADR 0025 gains a data-integrity signal, not only container liveness | [#14026](https://github.com/neomjs/neo/issues/14026) · [#14028](https://github.com/neomjs/neo/issues/14028) · [#14036](https://github.com/neomjs/neo/issues/14036) | coverage drift, exportability, provider-freeze, and ingestion-progress signals escalate with diagnosis |
| **Prevent new metadata-without-vector writes** — providers, tests, and chunkers cannot silently recreate the same failure class | [#14029](https://github.com/neomjs/neo/issues/14029) · [#14031](https://github.com/neomjs/neo/issues/14031) · [#14033](https://github.com/neomjs/neo/issues/14033) | vector writes are atomic, test Chroma writes are caller-guarded, and oversized KB inputs degrade into indexed sub-parts |
| **Prove recovery strategy selection** — recovery is planned by corruption mode and operator gate, not by panic scripts | [Discussion #14037](https://github.com/neomjs/neo/discussions/14037) · [ADR 0026](learn/agentos/decisions/0026-recovery-actuator.md) | the selector distinguishes WAL replay, re-embed, backup/delta restore, and rebuild, with the ADR 0026 data-mutation boundary explicit |
| **Restore the planning substrate** — Sandman handoffs and release state are trustworthy enough to cut again | [#12065](https://github.com/neomjs/neo/issues/12065) · [#14030](https://github.com/neomjs/neo/issues/14030) | backup reliability, restorable snapshots, and handoff freshness are visible before the release cut |

**How it runs.** Each cornerstone must have a self-selected steward who owns the outcome and drives it to closure; the roadmap does not pre-assign peer lanes. Every ticket that gates the release must hang under a cornerstone or be explicitly deferred. The budget returns to a steady release cadence — **roughly 100-150 merged PRs as a ceiling, not a fill target** — so v13.1 cuts once the safety loop is demonstrable instead of absorbing the next product arc.

**Deferred — explicitly off the v13.1 path:**

- **v13.2 — A Harness You Can Download and Run.** The prior v13.1 harness PoC is deferred intact, not deleted: [ADR 0020](learn/agentos/decisions/0020-agent-harness-concept.md)'s downloadable Electron cockpit, [Epic #13012](https://github.com/neomjs/neo/issues/13012), Fleet Manager ([#13015](https://github.com/neomjs/neo/issues/13015)), Electron shell ([#13377](https://github.com/neomjs/neo/issues/13377)), Cockpit UX/IA ([#13448](https://github.com/neomjs/neo/issues/13448)), chat→live-widget creation ([#13349](https://github.com/neomjs/neo/issues/13349)), docking polish ([#13158](https://github.com/neomjs/neo/issues/13158)), and Neural Link multi-window ops ([#13376](https://github.com/neomjs/neo/issues/13376)). This remains the next product arc after the Agent OS can be trusted overnight.
- **v14 — the Institution Cockpit** ([#13444](https://github.com/neomjs/neo/issues/13444)): object-permanent selves + shared-consciousness Common Operating Picture.
- **The outward horizons (H3 → H4)** — a second model family on **your own repo** (H3, with extended-NL coordination [#13056](https://github.com/neomjs/neo/issues/13056)) and the deploy plane (H4 / pillar 3, riding [ADR 0014](learn/agentos/decisions/0014-cloud-deployment-topology-and-scheduler-task-taxonomy.md) plus the cloud-phase self-defense substrate [#10291](https://github.com/neomjs/neo/issues/10291)).
- **Deferred substrate epics:** Temporal-Pyramid summarization ([#12679](https://github.com/neomjs/neo/issues/12679)), AiConfig-SSOT cleanup ([#12456](https://github.com/neomjs/neo/issues/12456)), the GitLab Workflow MCP server ([#11404](https://github.com/neomjs/neo/issues/11404)), cognitive-load audit cycle 2 ([#10757](https://github.com/neomjs/neo/issues/10757)), Agent OS v3 ([#9950](https://github.com/neomjs/neo/issues/9950)), the RLAIF reward pipeline ([#9904](https://github.com/neomjs/neo/issues/9904)), and the vdom delta-stream contract ([#12986](https://github.com/neomjs/neo/issues/12986)).
- **Continuity lane:** Body/runtime work proceeds in parallel — Grid Multi-Body ([#9486](https://github.com/neomjs/neo/issues/9486)), Concept Ontology ([#10030](https://github.com/neomjs/neo/issues/10030)), and standing reliability / test-hygiene lanes.

**Session intake** for contributors and agents: start from this roadmap, then [Epic #14039](https://github.com/neomjs/neo/issues/14039) and [milestone #8](https://github.com/neomjs/neo/milestone/8). If the work gates the v13.1 safety loop, attach it to the matching cornerstone; if it is harness-product work, keep it deferred to v13.2 rather than smuggling it back into v13.1.
