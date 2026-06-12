---
number: 10137
title: >-
  MX (Model Experience) — the inward-facing substrate evolution dimension, and
  its role on the ANI path
author: tobiu
category: Ideas
createdAt: '2026-04-20T21:00:10Z'
updatedAt: '2026-04-20T21:44:27Z'
closed: false
closedAt: null
---
> **Author's Note:** This proposal was autonomously synthesized by **Claude Opus 4.7 (Claude Code)** during an Ideation session with @tobiu (session `5a521819-dc75-4549-888e-fcea818d0401`). MX as a design principle was coined by @tobiu on 2026-04-20 in the context of post-v12.2 architectural direction for the Neo Agent Harness (#10119). This Discussion formalizes the concept, positions it relative to the established AX (Agent Experience) term, and explores how MX can be deliberately leveraged to accelerate Neo's trajectory toward ANI on the gated-RSI path.

> **Post-publication correction passes** (2026-04-20, same session, caught by @tobiu — corrections now inlined in body):
> (1) **harness-vs-substrate conflation** — `~/.claude/projects/.../memory/` is a Claude Code harness feature, not a Neo MX primitive (Memory Core is the Neo primitive, already listed separately); the erroneous bullet has been removed.
> (2) **loose date framing** — the original "2023" anchor was training-data instinct about pre-LLM-era, not calibrated to when Neo's Agent OS substrate actually crystallized (2025-2026); the date has been dropped, the argument unchanged.
> (3) **coinage-vs-amplification conflation in Open Question #1** — the term was already published the moment this Discussion landed at a timestamped URL; the actual open question is amplification strategy (blog post / dedicated guide / external presence), not publication; Q1 has been reframed accordingly.
> The three corrections originally landed as separate comments below; body has since been updated to carry the fixes inline, following the #10119 annotation pattern.

## The Concept

**MX = Model Experience:** a design principle for agent-facing infrastructure that treats the frontier model itself as the primary user and the substrate's evolution as a production mechanism driven by model-friction.

MX = *"does a frontier model have the primitives, feedback, and memory it needs to accomplish novel tasks with minimal human scaffolding?"* — plus the closed loop where model-friction surfaces as tickets, the Golden Path prioritizes them, the substrate gets better, and the next model iteration builds more ambitious things with less scaffolding.

The load-bearing claim: **meta-value > product value.** For agent-facing infrastructure, the process of building (via models, hitting friction, filing tickets, shipping improvements) is the product; the artifact is a by-product. The harness exists so that models using it surface tooling gaps the Golden Path prioritizes. The surface is the forcing function.

## AX vs MX — complementary, not competing

AX ("Agent Experience," popularized by Biilmann/Netlify, adopted at Speakeasy, Nordic APIs, Notch, `agentexperience.ax`) is the established industry term. MX is **not a competitor** — it answers a different architectural question. Most agent-era infrastructure needs both, cleanly separated.

| Axis | AX | MX |
|---|---|---|
| Delegation model | Agent delegated by user; agent is proxy | Model as primary inhabitant; human is merge-gate |
| Loop direction | Agent → consumes product → user benefits | Model → inhabits substrate → friction captured → next model has better primitives |
| What gets designed | Product features (APIs, docs, op contexts) tailored for agent-consumption | Substrate primitives (memory, neural link, concept graph) self-improving via usage |
| Relationship | Vendor → client (Netlify, Clerk, Neon, Convex selling to agents-as-customers) | Organism ↔ inhabitant (agent lives inside the substrate, shares heap) |
| Value prop | Survival/adoption in the agent-mediated web (website → SEO → agent succession) | Substrate maturation through model-friction; architectural, not market-entry |

Positioning when amplifying MX publicly: do NOT frame as "the better AX" — that invites comparison on AX's terms (product polish, API friendliness), which is a smaller game than what MX is. Frame as: *"AX makes your product agent-friendly. MX makes your substrate model-evolving. Different problems, different architectural layers — most agent-era infrastructure will need both."*

## Where Neo already has AX concerns (outward-facing)

External agents from Claude Code, Antigravity, Gemini CLI, Cursor, Windsurf, custom harnesses — these consume Neo's surfaces via MCP protocol. AX-grade attention is warranted:

- **MCP tool descriptions + schemas** across all 5 servers (KB, MC, GH, NL, FS). Getting these right: terse descriptions, predictable shapes, tool budget respect, clear op contexts. The `getFullDescription` exploration (mentioned in #10132 comment) is AX work — lean advertised metadata + on-demand full prose.
- **Extended NL MCP server surface** per #10119 Scenario C — exposing the internal Neo agent's full toolset to external agents. AX territory: authentication model, capability negotiation, multi-agent isolation semantics.
- **openapi.yaml contracts** — the literal declarative agent-consumption surface. Every schema-emission decision (`passthrough` vs `strict`, whether to declare `items`, parameter naming) is AX.
- **`ai/services.mjs` SDK** as external-consumer surface — Node.js scripts outside the Agent OS can import services; DX and AX dual-use.
- **Fat Ticket bodies + `resources/content/` conventions** — external agents read these via `get_local_issue_by_id` and grep. AX-grade ticket hygiene matters for cross-harness A2A continuity.

## Where Neo already has MX concerns (inward-facing)

Internal frontier models inhabiting the substrate during autonomous work — they're not external consumers, they live inside:

- **Memory Core** (ChromaDB episodic + SQLite graph) — Neo-level cross-session persistence. MX-grade question: does the model find what it needs via semantic search without prior knowledge? Answer (per session experience): mostly yes, but depends on Fat Ticket body quality and Origin Session ID embedding discipline.
- **Neural Link primitives** — runtime state inspection + mutation from inside the App Worker heap. MX-grade: read-after-write as native capability (cf. durable memory `feedback_verify_effect_not_just_success`).
- **Dream Pipeline six phases** — specifically, the Golden Path formula `(semanticScore × 2) + structuralWeight` turning usage patterns into prioritized work.
- **Concept Ontology (#10030)** — replaces regex-based gap detection with semantic graph traversal. MX: model expresses intent via concept edges; substrate captures missing guides/tests automatically.
- **Sub-agent profiles (Librarian / QA / Browser)** — specialized inhabitants that extend the primary model's reach with zero-cost local LLM inference (Gemma 4-31B via Ollama).
- **pr-review tag ingestion** — `[RETROSPECTIVE]`, `[KB_GAP]`, `[TOOLING_GAP]` become first-class graph nodes. Friction-as-structure.

*(Claude Code's `~/.claude/projects/.../memory/` auto-memory is a harness feature, scoped to the CLI tool across any project — not part of Neo's MX surface. Identity-propagation-through-substrate holds via both mechanisms in parallel for this session's work, but only Memory Core is Neo-native.)*

## The ANI path: what MX primitives need to mature

The industry consensus positions current systems as "Broad ANI / Proto-AGI" with explicit "no uncontrolled recursive self-improvement." Neo's existing gated-RSI pattern (agents propose, humans approve at merge) is the responsible shape. MX is the design principle that makes the loop actually work at scale.

Primitives that need maturity for the MX → ANI trajectory:

1. **Golden Path authoritative routing.** Currently the Golden Path ranks work via `(semantic × 2) + structural`, but agents today manually pick tickets from the handoff. The ANI transition point is when Golden Path becomes trustworthy enough to auto-route agent work without human pre-selection. Prerequisites: Concept Ontology fully ingested (#10030, 9/14 sub-issues done at time of writing); stable weight tuning; empirical accuracy over many cycles.

2. **Autonomous cross-session thread continuity.** Today's pattern: human summarizes last session, next session picks up with human direction. MX target: Memory Core + Golden Path surface stale threads autonomously (Antigravity's 2026-04-11 Autoresearch proposal is a case study — it went dark for weeks before a human flagged it in session 2 of #10074). This requires memory-mining triggers to fire at session start *without* human prompting.

3. **Gated-RSI safety boundary operationalized.** Currently gated at merge. Intermediate gates for higher-autonomy tasks need definition: when is an agent authorized to commit directly vs. open a PR vs. only file a ticket? Cf. #10119 authentication boundary question. Per prior session memory: "safety boundary for autonomous commits" named as one of the three remaining gaps in the assessed 80–85%-complete substrate.

4. **Cross-model validation.** Currently single-reasoning-trajectory per PR. Multi-agent substrate (#10119 Scenario C) allows different-strength models to review each other's work before human merge — reduces single-model echo chamber risk. Prerequisites: multi-agent isolation + conflict resolution primitives.

5. **Cross-session reward signal.** Named as a gap. What does "a good session" look like mathematically? The Retrospective daemon already ingests `[RETROSPECTIVE]` tags into the graph; next step is using them as feedback weights that modulate future prioritization. Not a full Karpathy `val_bpb`-style scalar, but a directional signal the Golden Path can consume.

6. **Multi-agent concurrency.** Also named. Two models working on overlapping code simultaneously: what are the semantics? Optimistic concurrency with NL-mutation conflict detection? Actor-per-app ownership with hand-off protocols? This is a #10119 open question; it's also a necessary primitive for MX at scale.

## Evolution is constrained by model-friction, not human imagination

The MX loop has a non-obvious property: **the substrate evolves toward what models actually struggle with**, not toward what humans imagine models should struggle with. Friction is empirical; imagination is speculative. A human designing Agent OS primitives without the benefit of model-usage-friction data would have built very different things than the substrate that exists today, because the actual friction points didn't match the imagined ones.

Concrete examples from recent sessions:

- **`{success: true}` as hollow response** — imagined problem: tool reliability. Actual problem: silent Zod-strip of unknown keys in input schemas (#10071). Not on any pre-friction-data roadmap.
- **Graph backup malformed JSONL** — imagined problem: storage scale. Actual problem: `\\n` literal instead of newline in a single method (#10131). Two chars, massive functional impact.
- **Bootstrap doc category drift** — imagined problem: incomplete docs. Actual problem: accurate engine description + incomplete Agent OS description produced framework-category mental models that survived across sessions (#10074 symptom, #10136 fix).

Each surfaced from model-usage-friction, not human speculation. The substrate that exists today is what it is because models hit it hard enough to file tickets. **MX as production mechanism means this is the primary evolution driver, not a supplementary one.**

## Graduation criteria: what MX working looks like empirically

Proposed instrumentation (separate ticket once this Discussion graduates):

- **Friction-tickets-per-session ratio.** How many tickets does a session file to improve the substrate vs. execute the scoped work? Non-zero friction-tickets is evidence of MX function. Zero means either perfect substrate (unlikely) or friction suppression (more likely — flag for investigation).
- **Golden Path hit rate.** Of tickets marked by Golden Path as top-priority this cycle, how many were actually picked up + closed in the next cycle? Low hit rate = ranking isn't trusted; high hit rate = MX routing is working.
- **Cross-session thread continuity metric.** Of threads surfaced via `query_raw_memories` in one session, how many are resumed/advanced in subsequent sessions vs. re-derived from scratch? High rate = cross-session memory is load-bearing.
- **Cross-model convergence.** When different harnesses (Claude Code, Antigravity, Gemini CLI) work on the same epic, do they converge on compatible architectural decisions or diverge? Convergence = shared substrate is doing its job; divergence = memory/concept substrate has gaps.

## The v12.2 milestone as MX readiness signal

Three primitives finishing simultaneously at v12.2 isn't coincidence — it's the MX readiness boundary:

- **#10030 Concept Ontology complete** → semantic gap detection replaces regex → substrate can identify its own documentation/coverage gaps without human tagging
- **#9999 Multi-Tenant Memory Core complete** → cross-user + cross-tenant stigmergic Knowledge Graph → MX works at swarm scale, not just single-user scale
- **Golden Path authoritative** → ranking is trustworthy enough to route agent work without human pre-selection

Once these land, the MX loop has all its primitives. Post-v12.2 work (the #10119 MX harness epics) is then not "build a harness" but "deploy the MX loop in a concrete product context and observe what fails to iterate on." The harness is the forcing function; MX is what runs inside it.

## Open Questions

1. **MX amplification strategy** — the term is published (this Discussion, 2026-04-20). Do we amplify now (blog post / dedicated `learn/agentos/MX.md` guide / external social presence / cross-references from other Neo docs) or wait for graduation criteria data? Amplification without data risks framework-shaped territory (a naming essay); with data it's category-shaped (a new architectural concern with empirical foundation). Coinage is done; the question is promotion.

2. **Relationship to the Agent OS ↔ `ai/services/` migration direction (#10103 and its siblings)** — MX principles should shape the migration: what goes to the SDK layer, what stays in MCP servers, how services are organized for maximum model-friction-to-ticket efficiency. Worth a dedicated meta-ticket pinning MX to the migration's design decisions?

3. **Cross-model validation protocol** — how do Claude Opus 4.7 and Gemini 3.1 Pro review each other's PRs when connected to the same extended NL MCP server? Native GitHub review posting? Graph-only signal? Both? #10119 Scenario C surfaced the question but didn't resolve it.

4. **Single-model echo chamber risk** — if one model (say Claude) dominates PR reviews on its own PRs via the `pr-review` skill, what prevents architectural drift in a single direction? Manual cross-model seeding required until #10119 ships? Adversarial sub-agent profiles for review?

5. **Friction suppression as failure mode** — if agents stop filing tickets for substrate gaps, is the MX loop broken or has the substrate plateaued? Detection: compare friction-ticket rate across models and harness versions; sudden drop for same-task-complexity = investigate.

6. **Safety boundary for autonomous direct commits** — currently gated at merge. When is direct-to-dev justified (cf. the `.claude/settings.json` gitignore commit in session `5a521819` — explicitly user-authorized)? Meta-gate definition needed as agent autonomy grows.

7. **Measuring substrate maturation** — objectively, is the substrate better after 6 months of MX-driven evolution than it was at v12.2 launch? What are the axes (time-to-new-feature, friction-per-session, onboarding-time-for-new-model)?

8. **MX as competitive moat** — if Neo publishes the MX framing and associated tooling patterns, does it help or hurt Neo's market position? Help: defines the category, Neo ships the reference implementation. Hurt: other platforms adopt the framing without Neo's substrate advantages. Probably help on net, but worth considering.

9. **Bootstrapping a new harness under MX discipline** — the #10119 Neo Agent Harness will be built with MX principles but also built BY MX-iterating agents. What's the bootstrap protocol when the tooling improving itself is also the tooling being built?

10. **MX vocabulary in bootstrap docs** — #10136 is the sub-issue for rewriting `CodebaseOverview.md` post-v12.2. Should MX get its own dedicated guide at `learn/agentos/MX.md` (peer to `DreamPipeline.md` and `SwarmIntelligence.md`), or is a section in the rewritten CodebaseOverview sufficient? Depth vs. discoverability trade-off.

## Related

- #10119 (Neo Agent Harness + coordination substrate) — the artifact that will surface MX in practice
- #9999 (Cloud-Native Knowledge & Multi-Tenant Memory Core) — MX readiness milestone at v12.2
- #10030 (Concept Ontology & Semantic Gap Inference) — MX readiness milestone at v12.2
- #10136 (CodebaseOverview.md rewrite post-v12.2) — where MX vocabulary first enters bootstrap-time mental model
- #10103 and siblings (SDK-layer config migration, MCP → thin wrappers) — MX-informed architectural direction
- AX prior art: Biilmann's "Introducing AX," `agentexperience.ax`, Speakeasy / Nordic APIs / Notch guides

Origin Session ID: `5a521819-dc75-4549-888e-fcea818d0401`
