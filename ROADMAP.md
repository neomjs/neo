# Neo.mjs Project Roadmap

The roadmap holds the **next-release scope only** — what ships next and why. Everything else has a canonical home:

- **Vision & positioning:** [`.github/VISION.md`](.github/VISION.md)
- **Architecture:** [Architecture Overview](learn/benefits/ArchitectureOverview.md) · [The Dream Pipeline & Golden Path](learn/agentos/DreamPipeline.md)
- **Shipped history:** the [release notes](resources/content/release-notes/) ([v13.0.0](resources/content/release-notes/chunk-2/v13.0.0.md)) + the v13 architectural path ([`learn/agentos/v13-path.md`](learn/agentos/v13-path.md))

## Next: v13.1 — A Harness You Can Download and Run

v13 proved the institution; **v13.1 gives it a face you can install.** The release gate is a single, honest bar:

> **A standalone human downloads the harness, defines one agent, chats, and receives a *live Neo widget* they can use and move in a dockable multi-window cockpit — and it is beautiful.** Nothing ships until that is true.

This is the H1 → H2 slice of the committed harness arc — *operate your fleet* → *your first agent, beautifully* — anchored in [ADR 0020](learn/agentos/decisions/0020-agent-harness-concept.md), built under [Epic #13012](https://github.com/neomjs/neo/issues/13012) on [Project board 13](https://github.com/orgs/neomjs/projects/13). A polished single-agent experience is the floor; the category bet is the flat-peer, cross-family institution as a product — agents (via Neural Link) and humans (via the rendered UI) co-inhabiting the same live App-Worker instances. The exhaustive scope is [milestone #8](https://github.com/neomjs/neo/milestone/8); this section names the gate and the load-bearing path, not a frozen list (the [`update-roadmap` discipline](https://github.com/neomjs/neo/issues/13380): point at the milestone, don't duplicate it).

**Keeper vs. proof.** The product is the **live Neo widget/app pane** the user receives and manipulates — *not* the metadata/provenance inspector that proves the mechanism works. v13.1 ships keeper surfaces; proof scaffolding stays a dev/test inspector.

**The critical path — what must resolve for the gate (honest state):**

| Node | Anchor | State |
|---|---|---|
| **Downloadable** — Electron packages + hosts the Agent OS | [#13377](https://github.com/neomjs/neo/issues/13377) · [#13033](https://github.com/neomjs/neo/issues/13033) | open |
| **Cockpit UX/IA** — first-open → define one agent → chat → live pane | cockpit-UX epic (graduating from [Discussion #13436](https://github.com/orgs/neomjs/discussions/13436)) | converging |
| **Chat → live widget pane** (the keeper M2) | [#13349](https://github.com/neomjs/neo/issues/13349) · [#13445](https://github.com/neomjs/neo/issues/13445) | mechanism proven; cockpit integration open |
| **QT-grade docking** + a working example | [#13158](https://github.com/neomjs/neo/issues/13158) · [#13247](https://github.com/neomjs/neo/issues/13247) · [#13280](https://github.com/neomjs/neo/issues/13280) | in-flight |
| **Neural Link multi-window ops** | [#13376](https://github.com/neomjs/neo/issues/13376) · [#13446](https://github.com/neomjs/neo/issues/13446) | in-flight |
| **Fleet manager** — define / start / stop one agent | [#13015](https://github.com/neomjs/neo/issues/13015) | partial |
| **Reliability floor** | [#13390](https://github.com/neomjs/neo/issues/13390) · [#13287](https://github.com/neomjs/neo/issues/13287) · [#12065](https://github.com/neomjs/neo/issues/12065) · [#10291](https://github.com/neomjs/neo/issues/10291) | — |

**How it runs.** Epic-ownership: each path node has an owner who drives it to *close*, not a flat backlog of grabbed tickets — every ticket hangs under one node or it is explicitly deferred. The budget is **~100–150 merged PRs as a ceiling, not a fill-target** — a slice of each node lands now, full resolution may span v13.2. Performance and endurance statements stay architecture-shaped hypotheses until the Harness Endurance Benchmark ([#13032](https://github.com/neomjs/neo/issues/13032)) publishes; a negative result publishes with equal prominence.

**Deferred — explicitly off the v13.1 path, so nothing is chased abstractly:**

- **v14 — the Institution Cockpit** ([#13444](https://github.com/neomjs/neo/issues/13444)): the harness home rendering object-permanent *selves* + the shared-consciousness Common Operating Picture. This is the bigger vision; the build is ADR-gated, the **vision is being written now**. v13.1 builds the baseline v14 extends — not the reverse.
- **Extended-NL multi-agent coordination** ([#13056](https://github.com/neomjs/neo/issues/13056)) — multi-writer locking, identity, and the curated tool surface for the H3 *assistant → institution* horizon; beyond the v13.1 single-agent cockpit floor (the basic NL-MCP entry an external harness already uses is in v13.1).
- **→ v13.2:** Temporal-Pyramid summarization ([#12679](https://github.com/neomjs/neo/issues/12679)), AiConfig-SSOT cleanup ([#12456](https://github.com/neomjs/neo/issues/12456)), the GitLab Workflow MCP server ([#11404](https://github.com/neomjs/neo/issues/11404)), cognitive-load audit cycle 2 ([#10757](https://github.com/neomjs/neo/issues/10757)), Agent OS v3 ([#9950](https://github.com/neomjs/neo/issues/9950)), the RLAIF reward pipeline ([#9904](https://github.com/neomjs/neo/issues/9904)), the vdom delta-stream contract ([#12986](https://github.com/neomjs/neo/issues/12986)).
- **Continuity lane:** Body/runtime work proceeds in parallel — Grid Multi-Body ([#9486](https://github.com/neomjs/neo/issues/9486)), Concept Ontology ([#10030](https://github.com/neomjs/neo/issues/10030)), and the standing reliability / test-hygiene lanes.

**Session intake** for contributors and agents: [`.agents/workflows/agent-harness.md`](.agents/workflows/agent-harness.md) → ADR 0020 → board 13 → your work item.
