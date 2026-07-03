# ADR 0018: Neo Identity Source-of-Truth Model

> Architectural Decision Record defining how Neo's identity — what Neo *is* and what each audience can do next — stays coherent across the ~30+ surfaces that encode it. Splits identity into three governed classes with different update semantics: **facts** (single-valued; get a single source + derive/coherence-check), **framing** (deliberately audience-segmented; governed against a canonical apex with a drift-vs-intentional-divergence escalation branch), and **actions / CTAs** (audience-segmented next-step doors governed for liveness, proof adjacency, and business-owned content boundaries). Authority artifact for the repeatable `neo-identity-update` skill (ticket #12203; ACTIONS extension #12577).

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-05-30 (transitions to Accepted on approved, green PR merge at the human merge gate) |
| **Author** | @neo-opus-4-7 (Claude Opus 4.8) drafting; architecture confirmed by operator (@tobiu) across a 2026-05-30 brainstorm + 11-agent fan-out audit |
| **Operator direction** | 2026-05-30 session — "we need a new `/create-skill` for updating the neo identity and all affected areas… we could create a new ADR"; SSOT model is a load-bearing architectural decision, so it earns an ADR rather than a chat-pick |
| **Implementation ticket** | #12203 — *"Neo identity maintenance: facts-vs-framing ADR + update skill"* (this ADR is its foundational AC) |
| **Builds on** | the self-evolving software organism apex (Body `/src/` + Brain `/ai/` are the two hemispheres beneath it; see §2.7 OD-1) — the canonical frame this ADR governs against; the README is the surface that should lead with it |
| **Depends on** | ADR 0012 (Model-Stats Framework) — identity-handle de-versioning MUST preserve 0012's Per-Model-Identity decision; only the GitHub *handle* de-versions, the model-version pin stays in `ModelStats.md` |
| **Aligned with** | #10452 (Identity Rewrite, CLOSED) — that epic did the one-shot README/AGENTS rewrite; this ADR builds the machinery to *maintain* what it created |
| **Informs** | The `neo-identity-update` skill (#12203 AC2, ACTIONS extension #12577); future identity edits across all surface classes; the cross-family review gate for identity PRs |
| **Anti-anchor for** | Naive tagline find-replace; editing build-generated output directly; a single canonical SSOT doc for *everything* (which would flatten deliberate audience-segmentation); blanket de-versioning of per-model identity |

---

## 1. Context

Neo's identity is not a document — it is a **distributed property** spread across ~30+ surfaces: hand-edited canonical prose (`README.md`, `.github/VISION.md`, `learn/benefits/**`, `learn/agentos/*.md`, `.claude/CLAUDE.md` anchors), machine-facing structured data (`package.json`, `apps/portal/index.html` ld+json, portal home-view `.mjs` arrays), build-generated SEO output (`apps/portal/llms.txt`, `sitemap.xml` via `buildScripts/docs/seo/generate.mjs`), external-platform settings (GitHub repo description + topics, npm), and dated-snapshot metrics.

Epic #10452 ("Identity Rewrite", CLOSED 2026-04-30 via #10453/#10455) rewrote `README.md` + `AGENTS.md` into the 4-pillar digital-organism frame, but it was a **one-shot content edit**: it created no machinery to keep identity coherent over time, and no policy for the surfaces it didn't touch. Identity drifts continuously thereafter, because the frontier (capabilities) grows faster than the framing (positioning), and because countable facts live in JSON/HTML/generated files that hand-editing prose never reaches.

A 2026-05-30 11-agent fan-out audit (session `94a91ebc-d325-4d32-a746-4ff8c26c0342`) confirmed the drift is already live and substantial — ~25 drift rows, e.g.:

- **MCP-server count understated in 11 surfaces** (correct = 5 functional).
- `apps/portal/index.html` ld+json then carried stale package / Node / MCP-server facts (package was `12.1.0`, actual Node floor `24+`, functional MCP-server count `5`).
- `package.json` has **no `engines` field** → the Node floor is unenforced at install time.
- The identity handle `@neo-opus-4-7` appears in **63 files**; `ModelStats.md`'s sunset trigger ("Anthropic releases Opus 4.8+") has **already fired** with no rotation recorded.
- `AGENTS.md` had self-contradictory pillar wording (an older 3-pillar mapping beside the four co-load-bearing pillar anchor).
- `.github/VISION.md` carries the oldest framing ("platform for the next generation of web applications") and a "Corporate HQ / CEOs / PMs / Drones" hierarchy that contradicts the canonical Flat Peer-Team (`AGENTS.md §swarm_topology_anchor`).

The root problem: **identity surfaces have different update mechanics.** Facts need convergence, framing needs governed audience segmentation, and visitor next-step doors need CTA governance so strong claims do not dead-end or hide public proof. No substrate decision said which mechanic applied where. This ADR makes that decision.

V-B-A this turn: `ls learn/agentos/decisions/**` confirms no existing ADR governs identity source-of-truth; the closest precedent is ADR 0012, which solved the *same shape* (scattered fragments → layered SSOT) for the narrower model-stats domain. This ADR generalizes that pattern to identity-at-large.

---

## 2. Decision

### 2.1 The three governed classes (the core decision)

Every identity encoding is classified as one of three governed classes:

| Class | Definition | Cardinality | Mechanism |
|---|---|---|---|
| **FACT** | A verifiable value: version, server count, Node requirement, GA date, award, identity handle, a quoted motto. | **Single-valued** — exactly one true value at any time. | One canonical **source of truth** + every other occurrence **derives** from it (build-time), is **generated** from it, or is **coherence-checked** against it (lint). |
| **FRAMING** | Positioning / tagline / audience-targeting: "framework" vs "Application Engine" vs "digital organism" vs "Agent OS". | **Audience-segmented (deliberately multi-valued)** — different surfaces address different audiences and may legitimately differ. | A canonical **apex** framing; other framings are **governed clusters** coherence-checked *for compatibility* (not equality) with the apex, with a **drift-vs-intentional-divergence escalation branch**. |
| **ACTION** | A next-step surface: CTA copy, install command, proof link, community join, services/contact door, contribution door, or any surface that asks a visitor to do something. | **Audience-segmented and liveness-bound** — different audiences may need different doors, but a primary door must be live and appropriate. | Governed CTA inventory: every pitch has a door, primary doors are liveness-checked, strong claims surface visible proof nearby, and business/product-owned offer content is recorded as a dependency rather than invented. |

This split is the load-bearing decision. **Facts must converge; framing must stay deliberately divergent; actions must stay live, proof-adjacent, and audience-fit.** A skill that treated framing like facts (find-replace to one value) would destroy audience-segmentation signal; a skill that treated facts like framing (leave each surface to drift) would never fix the 11-surface server-count rot; a skill that omitted actions would let strong identity pitches dead-end into passive docs or stale community doors. The skill (#12203, #12577) is built to apply *different* logic per class.

### 2.2 Facts → single source + propagation

Each fact gets ONE canonical source. Facts subdivide by **volatility** — *heritage facts* are append-only (GA date, awards; never change, only accrete) and *frontier facts* are mutable (version, counts; drift continuously) — but both use the same SSOT+propagate mechanism; they differ only in refresh *trigger* (heritage: never; frontier: on capability change).

**Per-target source-of-truth ledger:**

| Propagation target | Volatility | Canonical SSOT | Propagation mechanism | Fan-out drift |
|---|---|---|---|---|
| Package version | frontier | `package.json` `version` | extend `buildScripts/release/prepare.mjs` to derive version-bearing structured surfaces + `learn/agentos/NeuralLink.md` version line; lint coherence-check the rest | former `NeuralLink.md` stale version line |
| MCP-server count / audience split | frontier | `package.json` scripts matching `ai:mcp-server-*` (NOT a naive `ls ai/mcp/server/` — that returns 7: it must exclude `shared/` infra **and** `gitlab-workflow/` PoC, yielding 5). Frontier harness defaults expose 4 because Codex, Claude, Gemini CLI, and Antigravity already provide native filesystem/tools; file-system is for `Neo.ai.Agent` / local harnessless loops. | derive into prose/JSON via build or lint coherence-check; the script manifest plus audience split is the single place the exclusion rule lives | 11 surfaces understate to 4/3/2 or conflate frontier-harness defaults with internal agent loops |
| Node requirement | frontier | `package.json` `engines.node` | add the field as install-time SSOT; derive doc mentions; lint | `AI_QUICK_START:13` "20+" |
| Identity handle | identity | `ai/graph/identityRoots.mjs` | route handle references through the seam; model-version stays in `ModelStats.md` per ADR 0012 (see §2.5) | `@neo-opus-4-7` in 63 files |
| Recurring motto | framing-constant | `learn/agentos/DreamPipeline.md` (origin) | a single quotable constant referenced, not re-typed | DreamPipeline 2×, README, ROADMAP |
| Codebase-scale metrics | dated-snapshot | `learn/guides/fundamentals/CodebaseOverview.md` (canonical numbers) | README "Platform at Scale" refreshes in lock-step; carry an explicit as-of date | README "State of May 1, 2026" |

The skill enforces this ledger: detect each fact's value at every occurrence, compare to the SSOT, and either auto-fix (mechanical) or — where derivation tooling is missing — open the gap as a fix-task.

### 2.3 Framing → canonical apex + governed clusters

Framing is governed, not unified. The mechanism:

1. **Canonical apex** — one framing is the source of authority for "what Neo is" (DECIDED: the **self-evolving software organism** frame — a professional end-to-end AI engineering team; Body `/src/` runtime + Brain `/ai/` are the two hemispheres beneath it; see §2.7 OD-1).
2. **Audience-segmented clusters** — other framings are legitimate when they address a distinct audience (e.g. the "Application Engine for the AI Era" cluster on npm/GitHub/`index.html`/hero/`llms.txt` targets discovery-by-engineers; "organism" targets repo-readers/researchers). A cluster is governed as ONE coupled statement so its members don't drift apart from *each other*.
3. **Compatibility check, not equality check** — a cluster passes if it is *compatible with* the apex (a narrower/audience-tuned projection), not if it is *identical to* it.
4. **Drift-vs-intentional-divergence escalation** — when a framing *contradicts* the apex, the skill classifies:
   - **Mechanical drift** (a stale generation that simply lags, e.g. an old tagline) → fix toward the apex.
   - **Intentional divergence** (a framing that may reflect a deliberate, still-valid stance — e.g. a *product* concept vs the *maintainer* topology) → **escalate to the operator (Tier-4)**; do not auto-rewrite.

The escalation branch exists because the audit found contradictions the skill *cannot* mechanically adjudicate — e.g. VISION's "CEO/PM/Drone hierarchy" contradicts the Flat Peer-Team anchor, but might describe an intended Command-Center *product* that orchestrates sub-agents (legitimate) rather than the *maintainer swarm* topology (which is flat). Only the operator can rule. Auto-rewriting would erase a possibly-deliberate stance.

### 2.3.1 Actions → governed doors + proof adjacency

ACTIONS are governed next-step surfaces, not prose decoration. The mechanism:

1. **Every pitch has a door** — if a surface pitches a capability, the intended audience gets an appropriate next step. "Read more" is only enough when the intended action is learning.
2. **Audience-segmented doors** — developers, evaluators, maintainers, and decision-makers may need different CTA types. The skill never find-replaces one CTA across every surface.
3. **Proof adjacency** — strong claims link nearby visible receipts: dated repo stats, merged PR history, public review conversations, Discussions, ADRs, docs, or examples.
4. **Liveness gate** — a primary CTA target must be live, maintained, and appropriate for the audience. Dead or low-retention channels cannot be primary by habit.
5. **Business-owned content boundary** — the skill governs CTA structure and checks. It does not invent offers, pricing, lead-capture copy, or contact destinations; those are explicit product/operator dependencies.

### 2.4 Propagation mechanisms (in preference order)

For any fact with >1 occurrence, the propagation mechanism is chosen in this order:

1. **Derive-at-build** — a build step writes the value from the SSOT (best; impossible to drift). E.g. extend `prepare.mjs` for version.
2. **Generate** — the surface is fully emitted from source (e.g. `llms.txt`/`sitemap.xml` from `generate.mjs`); fix the generator, never the output.
3. **Coherence-check (lint)** — a CI guard fails when an occurrence disagrees with the SSOT (for prose that can't be mechanically rewritten). E.g. an MCP-count guard.
4. **Manual-with-guard** — unavoidable hand-maintained duplicate (e.g. a literal in a `.mjs`), explicitly annotated as a mirror of its SSOT so the next editor knows.

### 2.5 Identity-handle special case (depends-on ADR 0012)

The 63-file `@neo-opus-4-7` sprawl is **not** a de-versioning-the-prose problem. Per ADR 0012, per-model identity is deliberate: the model-version lives in `ModelStats.md` and the per-model `AgentIdentity` graph node. This ADR decides only the **handle indirection**: references route through `ai/graph/identityRoots.mjs` so a GitHub-account rename (operator-owned; e.g. `@neo-opus-4-7` → `neo-opus-ada`, `@neo-gemini-3-1-pro` → `neo-gemini-pro`) is a *routed* change, not a 63-file edit. The lifecycle drift the audit found (sunset trigger fired, no rotation recorded) is an **ADR 0012 registry-update**, not an ADR 0018 concern — flagged here, owned there.

### 2.6 Cross-family review gate for identity PRs

Any PR that mutates an identity surface MUST receive a **cross-family review** before merge. Rationale (§3.4): an identity edit is a single-author change to canonical framing — exactly the self-authored-blind-spot risk class that cross-family review reliably catches (empirical anchors: #12146, #11999, #11962). Identity edits are higher-blast than the average PR, so the gate is mandatory, not advisory. (When only one family is active, the gate degrades to operator review — the human merge gate is the backstop.)

### 2.7 Operator-decision points (recommendations inline; operator confirms)

Three framing-authority calls are genuinely operator-owned (Tier-4). The skill cannot decide them; this ADR records recommendations for the operator to confirm or redline:

- **OD-1 — The canonical apex. GRADUATED (Discussion #12234, full cross-family triad, 2026-05-31).** Dated proof point (fixed calendar anchor): **in May 2026 the canonical repo crossed 700+ merged PRs and 800+ closed issues; in June 2026 it crossed 900+ merged PRs and 1,100+ closed issues**. Counts are merged-PR / closed-issue totals only, and public proof prose should stay conservative because the month-edge target moves while merges continue. **Never write a `peer-reviewed` qualifier** (the search verifies *merged*, not review-state) **or a month-over-month ratio / `accelerating` claim** without a precise metric spec + verification — they date-stamp the identity and the April→May delta was mis-stated as `~3×` (per @neo-gpt V-B-A `dc-17119216`/`dc-17119231` + operator flag). The canonical apex line:

  > **Neo.mjs is a self-evolving software organism — a professional, end-to-end AI engineering team that lives in its own open-source repository. Where the industry runs one AI agent and gets slop, Neo runs a swarm of minds from rival labs — Claude, Gemini, GPT — that read each other's reasoning through shared memory and Active Hybrid GraphRAG, catching what no single model can see in itself. Through the Neural Link possession interface, the swarm does not just read code; it inhabits live applications, inspecting semantic runtime state, mutating UI and data in real time, and turning conversational UIs from chat panels into agents collaborating inside the application. It autonomously runs the full engineering lifecycle: ideating, building, and cross-reviewing a production multi-threaded engine, running DreamService cycles to re-steer priorities, and closing self-healing loops where runtime failures, code defects, agent mistakes, and architectural friction become fixes, tickets, skills, memory, and new graph topology for the next cycle. In June 2026, the canonical repo recorded 900+ merged PRs and 1,100+ closed issues. It maintains its own codebase today; it is being built to inhabit yours, regardless of the models' training data.**

  Structure beneath the apex: **BODY (`/src/`)** = the high-performance off-main-thread UI runtime (JSON-first since 2019, App Worker as main actor, web multi-window; engine-category mental models apply *here only*); **BRAIN (`/ai/`)** = the entire Agent OS (≈41% of module count — institution + MX loop + Memory Core with **Active Hybrid GraphRAG** (`mutate_frontier` frontier-edge mutation + `GoldenPathSynthesizer` fusing semantic Chroma distance with SQLite structural weights to re-steer priorities) + KB + A2A + orchestrator + DreamService); **Neural Link** = a flagship capability, NOT the apex and NOT a "demo" (~2%; one package-exposed MCP server among five; conversational UIs + multi-agent multi-harness live collaboration, Discussion #10119).

  **Governance line** (founder-architect authority, NOT a slop-filter — per @neo-gpt correction `dc-17119184`): *Gated-RSI by design — the swarm can run the engineering lifecycle autonomously; in the canonical repo, final merge authority remains with the founder-architect as an intentional governance choice, preserving product taste, strategic coherence, and accountable ownership while the organism evolves in public.*

  **Register split:** "rival labs" + the anti-slop contrast = human-facing copy (README/portal hero) only; machine surfaces (ld+json, keywords, GitHub topics, the literal `<meta name="description">`) use the colder concise form and never the word "slop." Canonical concise meta-description (≤220 chars, package.json `description`): *"Neo.mjs is a self-evolving software organism: a professional end-to-end AI engineering team whose cross-model swarm inhabits live apps via Neural Link, Active Hybrid GraphRAG, DreamService, and self-healing loops."* Proof asset: blog #10074 (cross-family self-healing, first-person, verified-true) — publish + link from the apex's proof anchor. "Application Engine for the AI Era" (npm/SEO discovery) and "self-evolving digital organism" (VISION-doc framing) are retained as deeper/audience-segmented clusters, governed as compatible with — never the lead over — the institution apex.
- **OD-2 — The canonical heritage home. DECIDED (#12232, 2026-05-31).** V-B-A found `.github/STORY.md` already exists as the story-shaped origin / architecture narrative, while `.github/NEOMJS_HISTORY.md` is a pre-public contributor-credits and acknowledgements archive. Public-era heritage facts therefore live in `.github/STORY.md`; README and the portal About Us surface reference that home instead of duplicating the fact list. `.github/NEOMJS_HISTORY.md` remains untouched unless a future operator ruling deliberately changes its document kind. Heritage facts are append-only once verified. Exact OS-Awards category / placement claims require an acceptable external public source before publication; repo-local blog mentions are context, not enough by themselves.
- **OD-3 — The structuring metaphor. DECIDED (operator @tobiu, 2026-05-30).** **Two Hemispheres (Body `/src/` ↔ Brain `/ai/`) is the canonical top-level scaffold.** "Four Pillars (Brain / Swarm / Body / Evolution)" is **demoted**: Swarm and Evolution live *inside* the Brain (the MX loop, the cross-family swarm, and cross-model workflows all reside in `/ai/`), so they are not co-equal pillars alongside Body — presenting four peers mis-weights a single Body against three Brain-subsystems. Keep four-pillar language only as a deeper-doc elaboration of what the Brain contains, never as the top-level equal-weight scaffold.

---

## 3. Rationale

### 3.1 Why three classes, not one SSOT

A single canonical SSOT doc for *all* identity (e.g. "the README is identity, everything derives") fails because framing is **not single-valued** — the README "Who This Is For" section already declares deliberate audience-segmentation. Forcing npm's description to equal the README hero would push "digital organism" onto a surface where engineers search "multi-threaded framework". CTAs also have different physics: the right next step depends on audience, liveness, proof adjacency, and business-owned content. The facts/framing/actions split is the minimum structure that lets facts converge, framing stay deliberately plural, and visitor next steps remain inspectable and live.

### 3.2 Why this mirrors ADR 0012

ADR 0012 solved the same shape for model-stats: it split a domain into layers by **update semantics** (framework=rare / schema=rare / registry=frequent) rather than cramming one omnibus artifact. This ADR splits identity by **class** (facts=converge / framing=govern / actions=door+liveness+proof-check) for the same reason: each part gets the right mechanics, and architectural substrate doesn't churn when a frontier fact or business-owned CTA target changes.

### 3.3 Why fix generators, never generated output

`apps/portal/llms.txt` is ~559KB emitted by `generate.mjs:539-559`. Editing the output is clobbered on the next build *and looks done* — the worst failure mode (silent regression). Naming the generator as the edit point is a structural guard.

### 3.4 Why a cross-family review gate

PR #12201 was offered as evidence cross-family review works; V-B-A falsified that (single-author, 0 reviews, merged ~7 min after open). But the *principle* is strongly evidenced elsewhere — #12146 (66/66 green self-authored tests, cross-family caught a tier bug in the untested case), #11999 (27/27 stub-passing, prod path silently broken until cross-family direct-probe), #11962 (jitter math correct, live composition wrong). The pattern: cross-family review catches the mental-model blind spots an author's own green tests encode. Identity edits are precisely that risk class.

### 3.5 Why the handle indirection, not de-versioning

De-versioning the per-model identity prose would violate ADR 0012's deliberate Per-Model-Identity decision. The drift isn't the version in the name — it's the absence of a routing seam, so a rename is a 63-file churn. `identityRoots.mjs` already exists as that seam; this ADR routes through it.

---

## 4. Consequences

### Positive
- **Facts stop rotting** — each has one source + a propagation mechanism; the 11-surface server-count class becomes a single lint guard.
- **Framing stays deliberately plural** — audience-segmentation is preserved by design, not eroded by a sync pass.
- **Pitches stop dead-ending** — CTA surfaces are governed for liveness, audience fit, and proof adjacency without hard-coding business-owned offer content.
- **The generated-output trap is structurally closed** — the skill edits generators.
- **Identity edits get blind-spot defense** — the cross-family gate.
- **Graph-queryable** per ADR 0006 — this ADR ingests as an `ADR` node; the skill and #12203 link to it.

### Negative
- **The propagation tooling is partly unbuilt** — `prepare.mjs` must be extended; the MCP-count manifest + lint guard don't exist yet. The ADR decides the model; the build-out is downstream work (skill-run items, out of scope here).
- **New heritage claims still need evidence** — the home is decided, but facts added to it must remain verified and append-only.
- **Class classification needs judgment at the margin** — a "fact" embedded inside a framing sentence attached to a CTA (e.g. "try the first multi-worker engine") can be FACT, FRAMING, and ACTION at once; the skill must handle mixed surfaces.
- **CTA content can block downstream runs** — the skill may identify a business/product dependency instead of editing a surface when the right offer, inbox, or destination is not yet decided.

---

## 5. Boundary — what this ADR does NOT decide

- **The actual surface edits / drift fixes** — running the skill is a separate item (operator direction, #12203 Out-of-Scope).
- **The skill's internal structure** — authored per the `create-skill` Progressive Disclosure contract (#12203 AC2); this ADR is its foundation, not its spec.
- **GitHub account renames** — operator-owned (Tier-4); the skill *propagates* a rename, it doesn't perform it.
- **The model-lifecycle rotation** (sunset trigger fired) — owned by ADR 0012 registry-update discipline.
- **Rewriting the framing fossils** (VISION "web applications"; CEO/PM/Drone hierarchy) — content edits via the skill-run, gated by the §2.3 escalation branch.
- **Specific CTA offers / destinations** — ACTIONS governance records liveness and audience-fit, but concrete offer content and lead-capture routing are business/product decisions.
- **Unverified heritage claims** — OD-2 decides the home, not the truth of every future milestone. New claims still need source verification before publication.

## 6. Anti-Patterns

### 6.1 Treating framing like facts
Find-replacing every tagline to one value destroys deliberate audience-segmentation. Framing is governed for *compatibility* with the apex, not equality.

### 6.2 Treating facts like framing
Leaving each surface's version/count to be hand-maintained = the rot this ADR exists to end. Facts converge to an SSOT.

### 6.3 Editing generated output
Hand-editing `llms.txt`/`sitemap.xml` (or any build-emitted surface) is clobbered on rebuild and reads as done. Fix the generator.

### 6.4 Naive `ls`-as-server-count
`ls ai/mcp/server/` returns 7 (includes `shared/` infra + `gitlab-workflow/` PoC). The count SSOT is a curated functional manifest, not a directory listing.

### 6.5 Auto-rewriting an apex contradiction without escalation
A framing that contradicts the apex MAY be a deliberate divergence (product vs maintainer-topology). Classify drift-vs-divergence; escalate divergence to the operator.

### 6.6 De-versioning per-model identity
Only the GitHub *handle* de-versions (via `identityRoots.mjs`); the model-version stays in `ModelStats.md` per ADR 0012.

### 6.7 Treating actions like framing
Find-replacing a CTA across all surfaces destroys audience-specific next steps. ACTIONS are governed for liveness, proof adjacency, and audience fit, not prose equality.

## 7. V-B-A Pre-Flight for Future Authors

Before modifying identity substrate or the `neo-identity-update` skill:
1. Read this ADR, ADR 0012 (handle/model-version boundary), and the `README.md` apex frame.
2. Classify the surface: FACT, FRAMING, ACTION, or mixed? Pick the mechanism from §2.2/§2.3/§2.3.1.
3. For a fact: find its SSOT in the §2.2 ledger; never edit a derived occurrence directly.
4. For framing: check compatibility with the apex; if it contradicts, classify drift-vs-divergence and escalate divergence.
5. For actions: verify the door is live, audience-fit, proof-adjacent when claim-bearing, and not inventing operator-owned offer content.
6. For generated surfaces: edit the generator, never the output.
7. Ensure the change carries a cross-family review (§2.6).
8. Cite this ADR in PR bodies touching identity substrate.

## 8. Related
- **#12203** — implementation ticket (this ADR is its foundational AC); the `neo-identity-update` skill
- **#12577** — ACTIONS / CTA governance extension to this ADR and skill
- **#10452** — Identity Rewrite (CLOSED; this maintains what it created)
- **ADR 0012** — Model-Stats Framework (depends-on; handle/model-version boundary)
- **ADR 0006** — ADRs as Graph-Queryable Entities (this ADR ingests as an `ADR` node)
- **ADR 0007** — Compaction Taxonomy (Map vs World Atlas; facts lean Map/live, framing leans World-Atlas/authority)
- **ADR 0011** — Substrate Numbering Convention (heading/anchor form)
- `buildScripts/docs/seo/generate.mjs` — the generated-output source (llms.txt + sitemap.xml)
- `buildScripts/release/prepare.mjs` — the version-bump seam to extend
- `ai/graph/identityRoots.mjs` — the handle-indirection seam
- `.github/STORY.md` — canonical public-era heritage home (OD-2)
- `.github/NEOMJS_HISTORY.md` — pre-public contributor-credits archive; not the public-era heritage home
- Brainstorm + fan-out audit: Memory Core session `94a91ebc-d325-4d32-a746-4ff8c26c0342`

## 9. Status / Lifecycle
- **Proposed** while this ADR is under PR review.
- **Accepted** once the approved, green PR is merged at the human merge gate.
- **Periodic re-review trigger:** any new identity-surface class (a new machine-facing format, a new external platform, a new CTA / action class) OR any change to the facts-vs-framing-vs-actions boundary MUST cite this ADR.

Origin Session ID: 94a91ebc-d325-4d32-a746-4ff8c26c0342

Retrieval Hint: query_raw_memories("neo identity facts-vs-framing SSOT apex framing audience-segmented affected-areas map ADR 0018")
