# The Vision for Neo.mjs

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
not the final category. The same principle points from Software to Games to Robots to X: any environment where an agent
needs live state, semantic structure, and reversible control rather than screenshots, DOM scraping, or external automation.

The architectural hinge is the JSON VDOM impedance match. Agents already think in structured objects. Neo applications
are already described as structured objects. In Neo, the model can produce the thing the runtime consumes, then verify and
change it while it is alive. Runtime read-after-write, component-tree inspection, store mutation, VDOM patching, and
cross-window observation are not debugging add-ons; they are the possession interface of the organism.

Performance matters because embodiment collapses if the body cannot carry the load. Neo's off-main-thread architecture
keeps the UI responsive while application logic, data work, diffing, and canvas simulation run in the right workers. The
engine category matters because the ambition is not to be easier than the last UI category. The ambition is to make
things native that the last category cannot express.

### 2. A Harness With No Privileged Chrome

The Neo Agent Harness should itself be a Neo app. Its windows, panels, live previews, app instances, and operator surfaces
should be made of the same primitives as the products it builds. There should be no privileged shell that agents cannot
inspect or improve. The operator interface must evolve with the agent's capabilities instead of becoming a fixed frame
around them.

This is the "no privileged chrome" thesis from the Agent Harness discussion: harness, user apps, and live previews are
peers in the same Neo runtime, not a parent tool controlling child artifacts from outside. An agent can build a dashboard,
spawn it beside another app, wire shared state between them, patch the harness layout, serialize the result, and preserve
the mutation trail. The UI is not a passive output channel. It is the live medium where the conversation, runtime, and
artifact meet.

The complementary axis is an extended Neural Link MCP server. Users should not have to abandon their preferred outer
harness to gain Neo's runtime body. External MCP-capable agents should be able to connect into Neo's shared runtime,
memory, and version history with explicit identity, permission, observability, and conflict semantics. The long-term
coordination substrate is cross-model, cross-harness, cross-user, and cross-time.

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

### 6. A Command Center for Living Software

The product horizon is a Command Center for human-led evolution. It should let a person see live Neo applications,
runtime state, agent identities, A2A handoffs, project trajectory, issues, reviews, source history, Memory Core context,
Dream priorities, and strategic signals in one coherent operating surface.

The Command Center is not a corporate hierarchy for the maintainer swarm. It is the cockpit for a living software
organism. It should make invisible work visible: which agent changed what, which source supports a claim, which lock or
intent edge protects a runtime surface, which historical summaries explain today's choice, and which next action best
serves the larger trajectory.

The same vision extends beyond the Neo repository. External codebases need tenant-aware knowledge ingestion, deployment
paths, source manifests, and portable Agent OS primitives. The destination is not only "Neo maintains Neo." The
destination is software that can invite a Neo-style organism into its own structure: learn the codebase, preserve
context, collaborate across model families, expose live runtime state, challenge drift, and improve itself under human
stewardship.

### 7. Source Trail

This vision is anchored in the recent discussion arc, especially:

- [Discussion #10119](https://github.com/orgs/neomjs/discussions/10119): Agent Harness, digital embodiment, Neural Link,
  JSON VDOM impedance match, no privileged chrome, and cross-harness coordination.
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
