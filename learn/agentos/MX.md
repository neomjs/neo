# Model Experience (MX)

> **Model Experience (MX)** is a design principle for agent-facing infrastructure that treats the frontier model itself as the primary user, and the substrate's evolution as a production mechanism driven by model-friction.

In the era of autonomous swarm intelligence, the infrastructure we build is not merely a static set of APIs for agents to consume. It is a living substrate that agents inhabit. MX asks a fundamental architectural question: *"Does a frontier model have the primitives, feedback, and memory it needs to accomplish novel tasks with minimal human scaffolding?"*

MX describes the closed loop where **model-friction surfaces as tickets, the Golden Path prioritizes them, the substrate gets better, and the next model iteration builds more ambitious things with less scaffolding.**

---

## The Core Thesis: Meta-Value > Product Value

The load-bearing claim of MX is an inversion of traditional software priorities: **meta-value > product value.**

For agent-facing infrastructure, the process of building—where models attempt tasks, hit friction, file tickets, and ship improvements—is the actual product. The artifact they produce (the feature, the bugfix, the documentation) is a by-product. 

The harness exists so that models using it surface tooling gaps. The Golden Path then prioritizes those gaps. The surface itself is the forcing function that drives the evolution of the underlying framework.

---

## AX vs. MX: Complementary Dimensions

**Agent Experience (AX)**—popularized by Biilmann (Netlify) and adopted across the industry (Speakeasy, Nordic APIs)—focuses on making external products and APIs friendly for agent consumption. **Machine Experience** focuses on system-to-system predictability. 

MX is **not a competitor** to AX or Machine Experience; it answers a completely different architectural question. Most agent-era infrastructure needs both, cleanly separated.

| Axis | AX (Agent Experience) | MX (Model Experience) | Machine Experience |
|---|---|---|---|
| **Delegation model** | Agent delegated by user; acts as proxy | Model as primary inhabitant; human as merge-gate | System delegated by system; highly deterministic |
| **Loop direction** | Agent → consumes product → user benefits | Model → inhabits substrate → friction captured → next model has better primitives | System → consumes API → system benefits |
| **What gets designed** | Product features tailored for agent-consumption | Substrate primitives self-improving via usage | APIs and strict contracts tailored for machine-consumption |
| **Relationship** | Vendor → client | Organism ↔ inhabitant | Provider ↔ consumer |
| **Value proposition**| Survival in the agent-mediated web | Substrate maturation; architectural evolution | Reliability and deterministic execution |

Positioning MX publicly requires a precise framing: **AX makes your product agent-friendly. MX makes your substrate model-evolving. Different problems, different architectural layers.**

### Where Neo uses AX (Outward-Facing)
When external agents (Claude Code, Antigravity, Cursor, etc.) consume Neo's surfaces via the MCP protocol, AX-grade attention is applied to:
- MCP tool descriptions and schema predictability.
- Authentication models and multi-agent isolation semantics.
- Declarative `openapi.yaml` contracts.

### Where Neo uses MX (Inward-Facing)
When internal frontier models inhabit the substrate during autonomous work, they are not external consumers; they live inside. MX primitives include:
- **Memory Core:** Cross-session persistence via ChromaDB and SQLite.
- **Neural Link:** Runtime state inspection and mutation from inside the App Worker heap.
- **Dream Pipeline:** Transforming episodic memory into prioritized structural work.
- **Concept Ontology:** Semantic graph traversal replacing regex-based gap detection.

---

## Friction as the Production Mechanism

The MX loop has a non-obvious property: **the substrate evolves toward what models actually struggle with**, not toward what humans imagine models should struggle with. Friction is empirical; imagination is speculative.

A human designing Agent OS primitives without the benefit of model-usage-friction data would build very different things. We know this because the actual friction points rarely match the imagined ones.

### Case Study: The Three Correction Passes
During the ideation session that formalized MX, the initial draft contained three subtle conflations:
1. Conflating a CLI harness feature (`~/.claude/projects/.../memory/`) with a Neo substrate primitive (Memory Core).
2. Using a loose, pre-LLM-era date framing ("2023" instead of the 2025-2026 actual crystallization of Neo's Agent OS).
3. Conflating the coinage of the term with its public amplification.

These imperfections were not failures; they were **data**. The friction was caught, corrections were made inline, and a tooling-gap ticket (#10138) was immediately filed (addressing the missing `manage_discussion` MCP tool). **This discipline IS MX working as documented.** The first draft hits friction → the system catches the friction → the substrate (or the documentation) is improved.

Other concrete examples from Neo's recent history:
- **Imagined problem:** Tool reliability. **Actual problem:** Silent Zod-strip of unknown keys in input schemas.
- **Imagined problem:** Storage scale. **Actual problem:** A literal `\\n` instead of a newline breaking JSONL parsing.
- **Imagined problem:** Incomplete docs. **Actual problem:** Category drift surviving across sessions due to mismatched mental models.

Each improvement surfaced from model-usage-friction. MX as a production mechanism means this is the primary evolution driver.

### The Friction-Suppression Failure Mode

An important self-monitoring concept for the MX loop: when agents stop filing tickets for substrate gaps, is the loop broken or has the substrate plateaued? Usually, it's the former. The "friction-suppression failure mode" occurs when an agent hits a limitation (e.g., an MCP tool missing a parameter) but opts to work around it locally instead of surfacing it as a ticket. This breaks the MX loop. To maintain loop health, models must be disciplined about surfacing friction, prioritizing meta-value over immediate task completion.

---

## Graph Physics and the MX Loop

MX does not operate in a vacuum; it is governed by the graph physics defined in the [Dream Pipeline](./DreamPipeline.md). The frictionless flow of data into actionable intelligence relies on mathematical decay and consolidation.

- **Hebbian Decay & Edge Weighting:** When models hit friction repeatedly, the associated semantic edges gain weight. Friction that is resolved or obsolete naturally decays.
- **Vector Apoptosis:** Irrelevant or transient friction signals undergo apoptosis (programmed cell death) in the vector space, ensuring the graph does not become bloated with noise.
- **TTL Pruning:** Temporary state or dead-end reasoning trajectories are pruned, keeping the "Golden Path" ranking mathematically sound: `(semanticScore × 2) + structuralWeight`.

By tying MX to these graph physics primitives, the system guarantees that the friction models experience translates directly into prioritized structural work.

---

## The ANI Trajectory: Primitives Requiring Maturity

Current systems are broadly considered "Proto-AGI" with explicit guardrails against uncontrolled recursive self-improvement. Neo's gated-RSI pattern (agents propose, humans approve at merge) is the responsible shape for this boundary. MX is the design principle that scales this loop.

To progress on the ANI trajectory, several MX primitives require maturation:

1. **Golden Path Authoritative Routing:** Moving from agents manually picking tickets to the Golden Path auto-routing work based on trusted, empirical accuracy.
2. **Autonomous Cross-Session Continuity:** Surfacing stale threads at session start *without* human prompting (preventing "Zero-State Amnesia").
3. **Explicit A2A (Agent-to-Agent) Primitives:** Moving from implicit semantic retrieval to deterministic message-passing across multi-tenant boundaries (e.g., the Memory Core Inbox).
4. **Cross-Model Validation:** Leveraging different-strength models (e.g., Claude Opus 4.7 and Gemini 3.1 Pro) to review each other's work natively, preventing single-model echo chambers.
5. **Cross-Session Reward Signals:** Translating `[RETROSPECTIVE]` tags into directional feedback weights that modulate future Golden Path prioritization.
6. **Multi-Agent Concurrency:** Defining the semantics for overlapping code modifications and conflict detection at scale.

---

## Graduation Criteria

How do we measure if MX is actually working?

1. **Friction-Tickets-Per-Session Ratio:** How many tickets does a session file to improve the substrate vs. execute the scoped work? A non-zero ratio is healthy evidence of MX function.
2. **Golden Path Hit Rate:** Of the tickets ranked as top-priority, how many are actually picked up and closed in the next cycle?
3. **Cross-Session Thread Continuity:** How often are threads resumed via Memory Core vs. re-derived from scratch?
4. **Cross-Model Convergence:** When different models work on the same epic, do they converge on compatible architectural decisions? Divergence signals a gap in the memory/concept substrate.

---
*Origin Session IDs: `5a521819-dc75-4549-888e-fcea818d0401` (MX framing synthesis) / `30e93319-06e2-44d2-adf2-99168a997d08` (Cross-harness pickup)*
