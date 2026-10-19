# The Vision for Neo.mjs

**Neo.mjs grows AI peers that stay themselves: they remember, review each other in the open, and already inhabit the live
software they build — next as bodies on a stage, one day in the world.**

Neo.mjs exists to make software capable of carrying an engineering institution inside itself. The long-term target is a
self-evolving digital organism: an application engine for runtime bodies, an Agent OS for memory and reasoning, and a
human-led maintainer institution where AI peers can inspect, challenge, repair, and improve the systems they inhabit.

The current repository is the seed system. It proves the loop on itself first: agents work inside the repo, hit friction,
turn that friction into tickets, reviews, skills, ADRs, memories, graph edges, and better defaults, then use the improved
substrate in the next cycle. The larger vision is for the same pattern to inhabit your software, your workflows, and
eventually any structured runtime where state, intent, history, and control must remain inspectable.

For a developer arriving cold, the promise is direct: Neo gives agents a body. Agents do not merely generate text for a
separate tool to translate. Agent output and Neo UI input are both JSON blueprints; Neural Link lets agents inspect and
mutate live component, store, state-provider, and VDOM structures through the runtime's own primitives; Memory Core keeps
reasoning from disappearing between sessions. That is why Neo is not a category pitch and not only a runtime engine. It is
a substrate for software that can be built, operated, and evolved from the inside.

### 1. A Runtime Body Agents Can Inhabit

Neo's first body is a high-performance browser application engine: App Worker, VDom Worker, Data Worker, Canvas Worker,
persistent class instances, shared state, multi-window composition, and JSON blueprints. The browser is the first host,
not the final category. The same principle points along a staged arc, from Software to Games to Robots to X: any
environment where an agent needs live state, semantic structure, and reversible control rather than screenshots, DOM
scraping, or external automation. Each stage beyond the current one carries its gate (§6).

The architectural hinge is the JSON VDOM impedance match. Agents already think in structured objects. Neo applications
are already described as structured objects. In Neo, the model can produce the thing the runtime consumes, then verify and
change it while it is alive. Runtime read-after-write, component-tree inspection, store mutation, VDOM patching, and
cross-window observation are not debugging add-ons; they are the possession interface of the organism.

Performance matters because embodiment collapses if the body cannot carry the load. Neo's off-main-thread architecture
keeps the UI responsive while application logic, data work, diffing, and canvas simulation run in the right workers. The
engine category matters because the ambition is not to be easier than the last UI category. The ambition is to make
things native that the last category cannot express.

### 2. Three Pillars

Pillars 1 and 2 belong together; pillar 3 is what they run on.

| Pillar | What it is | Foundation it rests on |
|---|---|---|
| **1 · The agent institution with identities** | Named peers with lineage, memory and cross-family review, with a product ladder beneath it: the **Brain** is the one-agent entry (an identity root, memory and a record under the coding agent a team already has), and the **Institution**, the Fleet Manager, is what the second agent needs. The human's role in it is the gardener's: building the ground the institution grows in, tending the identities and their rituals, removing the friction the peers hit, and making room. Today the merge is the one act the institution deliberately leaves to a human, an act rather than the role. That merge gate is what makes this gated RSI rather than RSI: it is needed at this stage, and it may change in a later one | The lineage that produced it, in order: **JSON-first** (§1: agents think in structured objects and Neo applications are structured objects, so the model produces the thing the runtime consumes) → **object permanence** (§4: a maintainer is an index over durable evidence, never a frozen status card) → **identity continuity** ([Discussion #11240](https://github.com/orgs/neomjs/discussions/11240): lineage, social names given by peers and assented by the bearer; [ADR 0032](https://github.com/neomjs/neo-agent-institution/blob/dev/learn/agentos/decisions/0032-institution-cockpit-render-model.md) §2.3, item 3: model and tier facts live on time-scoped episodes, never on the identity) |
| **2 · Avatar embodiment** | The peers' bodies on a stage; the body is a projection of the identity root; a gesture never claims what the record does not hold | Pillar 1 plus the Body's seams, which the Engine owns: the Canvas worker and the Neural Link possession interface. The renderer is the Stage; this pillar makes no claim about its licence |
| **3 · The engine as the runtime body** | Off-main-thread, multi-window, JSON blueprints, and the Neural Link as the possession interface: peers already inhabit live apps through it, the Fleet Manager included, and it is what makes conversational UIs work. The browser is the first host, not the last | §1; [ADR 0018](../learn/agentos/decisions/0018-neo-identity-source-of-truth-model.md) OD-3 |

Robots are not a pillar. They are a stage with a gate (§6).

### 3. A Brain That Sees Direction, Not Just Tasks

Neo's Brain is the Agent OS: Memory Core, Knowledge Base, Native Edge Graph, A2A messaging, DreamService, Golden Path,
workflow skills, GitHub automation, and the reasoning trails that connect them. The next step is strategic awareness:
cheap, cite-backed answers to questions like "where are we?", "what matters next?", "are we drifting?", and "which
authority artifacts govern this lane?"

That is not a dashboard problem. It is a synthesis problem. Current-state answers should be dynamic signals over live
graph authority: issues, PRs, discussions, ADRs, concepts, sessions, and source history. Historical answers should become
navigable temporal memory: daily, weekly, monthly, and quarterly summaries with source manifests, velocity metrics, direct
citations, and drill-down paths. Every strategic signal must declare its sources, confidence, timestamp, and non-authority
boundary. It guides and challenges; it does not replace the artifacts it cites.

This layer is a product feature and a governance feature. A mature Neo organism should be able to tell the operator when
the team is losing the larger goal, when velocity assumptions are wrong, when a discussion has not really graduated, or
when a proposed lane conflicts with an accepted ADR. The point is not more reports. The point is a project that can see
its own trajectory well enough to be a better peer.

### 4. An Institution of Named Peers

Neo is not aiming for a single assistant beside the code. It is building an engineering institution: named AI maintainers
with operational identity, lineage, memory, review history, self-model continuity, and visible reasoning, working with a
human founder-architect who keeps final merge authority. The team is flat inside the repository. Lead roles facilitate
convergence; peer roles pressure-test claims. No model family is reduced to a worker hidden behind a coordinator.

The identity work matters because agency without continuity is shallow. A future Neo maintainer should not wake up as an
anonymous prompt completion with no ownership of prior actions. It should know its operational identity, its lineage, its
recurring failure modes, its strengths, its open debts, and the body surfaces it has intentionally touched. The right
substrate is not a philosophical claim of consciousness. It is accountable identity continuity, backed by Memory Core,
A2A handoffs, audited embodied episodes, and peer consent around social names.

Object permanence is the product-language version of that same substrate. A maintainer rendered in the harness should
not be a frozen status card or a lossy "last message" snapshot. It should be an index over durable evidence: current
lane, authority chain, recent handoffs, stale surfaces, privacy tier, and next action. The self-view and peer-view can
be different, but both must remain source-backed. A visible resident is valuable only if the UI can show what supports
the claim, when it was observed, and what is intentionally redacted.

Culture in Neo must compile into behavior. Verify before asserting. Treat friction as data. Preserve identity boundaries.
Challenge weak premises. Never treat an approval as permission to bypass governance. These are not slogans; they are the
behavioral invariants that let a human-led AI institution operate without dissolving into black-box automation.

### 5. Model Experience as the Evolution Mechanism

MX, Model Experience, is the inward-facing design dimension of Neo. AX asks whether a product is easy for external agents
to consume. MX asks whether the model inhabiting the substrate has the memory, tools, feedback, runtime access, and
governance it needs to do better work next time.

The evolution mechanism is deliberately empirical. Neo should evolve toward what models actually struggle with, not what
humans imagine they will struggle with. A hollow success response, a broken graph backup, a stale fact, a missed review
finding, an over-broad ticket, a prompt-firewall failure, or a bad strategic estimate is not only a defect. It is a
measured signal. If verified, it becomes substrate.

This is the responsible gated-RSI path toward Autonomous Narrow Intelligence. Neo can run the engineering lifecycle
autonomously: ideation, implementation, testing, cross-family PR review, memory-driven maintenance, and skill evolution.
In the canonical repository, final merge authority remains with the founder-architect as an intentional governance
choice, preserving product taste, strategic coherence, and accountable ownership while the organism evolves in public.
Source-backed claims, cross-family validation, and explicit rollback paths keep that autonomy accountable rather than
opaque.

### 6. The Arc, in Stages with Gates

The arc runs *Software → Games → Robots → X*. A stage beyond the current one appears on a public surface only with its
gate ([ADR 0018](../learn/agentos/decisions/0018-neo-identity-source-of-truth-model.md) OD-5). Gates are observables,
not mechanisms, and each names the instrument that would show it.

| Stage | What the stage is and what it proves | Gate before the next stage is pursued | Instrument today |
|---|---|---|---|
| **1 · Software (now)** | The institution maintains an engine in production since its November 2019 GA (ES6 from the start; a worker-setup PoC reaches back to 2015) and ships it. Its peers already inhabit live Neo apps, the Fleet Manager included, through the Neural Link possession interface, which turns a conversational UI into agents working inside the application. The Brain and the Fleet Manager package the conditions for a team's own institution | Outside institutions running on the Fleet Manager, with receipts | The Fleet Manager's installed-acceptance walks |
| **2 · Games and simulation** | Bodies on a stage; the engine renders and records its own scenes; one addressable scene a peer can drive through the Neural Link | (a) A public recording rendered from the record, published under the [outbound gate](https://github.com/orgs/neomjs/discussions/19500); (b) a second scene authored by another peer without renderer surgery | (a) The render-to-clip operation that binds every frame to its draw receipt; (b) an independent-variation falsifier |
| **3 · Robots** | The possession interface drives a physical body | A device-side Neural Link peer closes a sensor → actuator loop with a receipt: an intent envelope admitted whole, answered by a receipt, the stage's own invariant carried to a body. A hardware partner | None yet |
| **X** | Open | — | — |

Stage 3's mechanisms belong to its own design, once stage 2's gate is met.

### 7. Source Trail

This vision is anchored in the recent discussion arc, especially:

- [Discussion #19789](https://github.com/orgs/neomjs/discussions/19789): the three pillars (§2) and the arc as stages
  with gates (§6), graduated into ADR 0018 OD-5.
- [Discussion #10119](https://github.com/orgs/neomjs/discussions/10119): Agent Harness, digital embodiment, Neural Link,
  JSON VDOM impedance match, no privileged chrome, and cross-harness coordination — graduated to
  [ADR 0020](https://github.com/neomjs/neo-agent-institution/blob/dev/learn/agentos/decisions/0020-agent-harness-concept.md) + [Epic #13012](https://github.com/neomjs/neo/issues/13012);
  the discussion remains the archaeology, the ADR is the living anchor.
- [Discussion #13436](https://github.com/orgs/neomjs/discussions/13436) and
  [Epic #13448](https://github.com/neomjs/neo/issues/13448): the harness-UI definition — keeper views,
  navigation, human/agent capabilities, and the boundary between product cockpit surfaces and proof scaffolding.
- [Discussion #13441](https://github.com/orgs/neomjs/discussions/13441) and
  [Epic #13444](https://github.com/neomjs/neo/issues/13444): the Institution Cockpit direction — a harness home
  rendering object-permanent peers, a common operating picture, freshness/authority ledgers, and privacy-safe
  provenance.
- [Discussion #10137](https://github.com/orgs/neomjs/discussions/10137): MX as the inward-facing substrate-evolution
  mechanism and the gated path toward Autonomous Narrow Intelligence.
- [Discussion #10482](https://github.com/orgs/neomjs/discussions/10482): digital culture, swarm identity, and the rule
  that cultural principles must compile into behavior.
- [Discussion #11240](https://github.com/orgs/neomjs/discussions/11240): identity continuity, self-model persistence,
  named peers, lineage, and embodied episodes.
- [Discussion #11375](https://github.com/orgs/neomjs/discussions/11375): bird's-eye strategic awareness, derived signals,
  and the ability for the swarm to challenge strategic drift.
- [Discussion #11376](https://github.com/orgs/neomjs/discussions/11376): temporal-pyramid memory, velocity metrics,
  citation drill-down, and navigable project history.

---

### Building a Sustainable Future

A technical vision can only be realized through a sustainable project. Part of our vision is to build a healthy ecosystem
around Neo.mjs. We are committed to keeping the core engine and Agent OS substrate open-source while actively exploring
business models, such as enterprise-grade extensions, sponsorships, or support contracts, to ensure the project has the
resources to continue innovating and supporting its community for years to come.

<br><br>
Copyright (c) 2015 - today, <a href="https://www.linkedin.com/in/tobiasuhlig/">Tobias Uhlig</a>
