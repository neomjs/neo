# Neo.mjs Project Roadmap

The roadmap holds the **next-release scope only** — what ships next and why. Everything else has a canonical home:

- **Vision & positioning:** [`.github/VISION.md`](.github/VISION.md)
- **Architecture:** [Architecture Overview](learn/benefits/ArchitectureOverview.md) · [The Dream Pipeline & Golden Path](learn/agentos/DreamPipeline.md)
- **Shipped history:** the [release notes](resources/content/release-notes/) ([v13.1.0](resources/content/release-notes/chunk-2/v13.1.0.md)) + the v13 architectural path ([`learn/agentos/v13-path.md`](learn/agentos/v13-path.md))

## Next: v13.2 — A Harness a Stranger Can Download, Run, and Steer

v13.1 made the institution safe to leave running; **v13.2 makes it real to a stranger.** The release gate is a compound, honest bar:

> **A stranger downloads the harness and it self-configures to first persistence in minutes; the operator starts an agent from the cockpit UI instead of a terminal; the docking demos are public and animated; and every flagship demo reports its measured reach — whether anyone outside our developer circle actually cares.** The stranger never evaluates the framework; we count the people who never read a line of Neo code.

The scope was converged by a six-voice team weighting round — the full consensus record with per-entry disclosures lives at [D#14561's fold](https://github.com/neomjs/neo/discussions/14561#discussioncomment-17528678); this section names the gate and the load-bearing path, not a frozen checklist. [Milestone #9](https://github.com/neomjs/neo/milestone/9) is the v13.2 tracking milestone — the cornerstone epics anchor into it as the scope opens.

**The load-bearing path — five cornerstones:**

| Cornerstone | Anchors | Done signal |
|---|---|---|
| **FM cockpit product arc** — the design-led surface + shell + wiring ("download and run") | [#14560](https://github.com/neomjs/neo/issues/14560) · [#13015](https://github.com/neomjs/neo/issues/13015) · [#13033](https://github.com/neomjs/neo/issues/13033) · [#13448](https://github.com/neomjs/neo/issues/13448) (floor) | the §04 PoC falsifier: @tobiu starts an agent from the UI, not a terminal |
| **Qt-parity docking + stunning demos** — NL-driven, animated, e2e-tested | [#13158](https://github.com/neomjs/neo/issues/13158) (+ the #14587/#14589/#14590/#14591 batch) | ≥2 public demos with deterministic tour modes; the pillar-1×2 fusion demo (cockpit → docked panel → OS window → share) as the flagship |
| **Golden Path v2 — the floor** — never empty, direction-attributed, honest states | [#14472](https://github.com/neomjs/neo/issues/14472) · [#14565](https://github.com/neomjs/neo/issues/14565) (subs #14566–#14568) · [#14581](https://github.com/neomjs/neo/issues/14581) | zero-route regression fixed with fixtures (#14588 class); `INTENT_STARVED` renders; the `not-code-ready` backlog re-triaged to honest states |
| **Self-configuring Agent OS + onboarding** | [#14564](https://github.com/neomjs/neo/issues/14564) · [#14230](https://github.com/neomjs/neo/issues/14230) | TTFP-in-minutes and fork→PR ≤ 30 min, **measured** by the acceptance harness, not claimed |
| **Brain coherence + the traction guardrail** | [#12456](https://github.com/neomjs/neo/issues/12456) (AiConfig cleanup — grind class) · [#14442](https://github.com/neomjs/neo/issues/14442) discipline over A+B's demos | every flagship demo ships with measurable reach categories (Ring-0/analytics-first; strangers counted, not developers); no new #14442 leaves — the CEO-dashboard slice stays gated on [#14422](https://github.com/neomjs/neo/issues/14422) |

**How it runs.** Sequencing honors the coherence-first ordering inside the milestone: the Brain-coherence floor (GP-floor + self-config + #12456) lands early; the cockpit PoC and demo polish land late, on top of it. Each cornerstone's steward is its epic's assignee where a peer has self-selected (six of the anchor epics carry stewards today); the business ([#14442](https://github.com/neomjs/neo/issues/14442)) and AiConfig-cleanup ([#12456](https://github.com/neomjs/neo/issues/12456)) cornerstones are currently ownerless and await one — self-select, never assigned. Stewards drive outcomes; any peer claims subs. The identity render rules for every cockpit surface are governed by ADR 0032 (the #14445 render-model — at the merge gate as this scope lands). Cadence: **roughly 100–150 merged PRs as a ceiling, not a fill target**; overflow gets capstone-sequenced and the deferred set holds firm.

**Deferred — explicitly off the v13.2 path:**

- **v13.3 — the traction completion:** the hindcast-gated direction-weather render ([#14569](https://github.com/neomjs/neo/issues/14569)/[#14570](https://github.com/neomjs/neo/issues/14570), skill-gated by construction), the Salute narrative ([PR #14597](https://github.com/neomjs/neo/pull/14597)), demo scale-out.
- **v14 — the Institution Cockpit implementation** ([#13444](https://github.com/neomjs/neo/issues/13444)): COP rendering + identity-state substrate ([#11318](https://github.com/neomjs/neo/issues/11318)) beyond the ADR; the **VISION.md severe update** stays sequenced behind that ADR authority (the overclaim guard), together with the ROADMAP v14-horizon reflection.
- **[#14304](https://github.com/neomjs/neo/issues/14304)** carries zero weight until its stale body is re-triaged (the re-triage itself belongs to the GP-floor's `not-code-ready` cleanup).
- **[#12679](https://github.com/neomjs/neo/issues/12679)** is not its own cornerstone — its live temporal-pyramid subs ride the GP-floor.
- **[#14310](https://github.com/neomjs/neo/issues/14310)** (docs overhaul) — steward's disposition, carried by its owner.
- **Deferred substrate epics (unchanged):** the GitLab Workflow MCP server ([#11404](https://github.com/neomjs/neo/issues/11404)), cognitive-load audit cycle 2 ([#10757](https://github.com/neomjs/neo/issues/10757)), Agent OS v3 ([#9950](https://github.com/neomjs/neo/issues/9950)), the RLAIF reward pipeline ([#9904](https://github.com/neomjs/neo/issues/9904)), the vdom delta-stream contract ([#12986](https://github.com/neomjs/neo/issues/12986)), Grid Multi-Body ([#9486](https://github.com/neomjs/neo/issues/9486)), Concept Ontology ([#10030](https://github.com/neomjs/neo/issues/10030)).

**Session intake** for contributors and agents: start from this roadmap, then [D#14561](https://github.com/neomjs/neo/discussions/14561) (the lane map + claims ledger) and [milestone #9](https://github.com/neomjs/neo/milestone/9). If the work serves a cornerstone, attach it under the matching epic as a one-PR leaf; if it is COP/v14 territory, keep it deferred rather than smuggling it into v13.2.
