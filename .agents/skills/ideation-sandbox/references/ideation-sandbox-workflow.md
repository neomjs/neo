# Ideation Sandbox Workflow

## 1. Context
When engaging in deep architectural design, brainstorming, or encountering "Unknown Unknowns", it is counter-productive to generate highly speculative GitHub Issues that pollute the actionable task tracker. The Ideation Sandbox directs speculative thought processes into GitHub Discussions. Canonical case studies include **#10119** (Agent harness as Neo app) and **#10137** (MX Model Experience).

**Crucial Mindset Shift:** The Ideation Sandbox is NOT meant to serve as a holding pen or a "second shot" before blindly creating an Epic. It is a dedicated space to discuss, brainstorm back-and-forth, and rigorously apply **PR Depth Challenges**. As a reviewer, you are expected to actively challenge assumptions and push back on architectural proposals (just as you would in a PR), rather than merely rubber-stamping the idea for graduation.
*For skill-authoring discipline including Progressive Disclosure (why SKILL.md is a lightweight router pointing here), see `.agents/skills/create-skill/`.*

## 2. Initial Proposal (Authoring)
1. **Never create an Issue for ideation.** If your intent is speculative or exploratory, abort Issue creation immediately.
2. **Pre-Filing Precedent Sweep (Mandatory):** Before authoring a proposal that introduces new structural protocols or patterns, you MUST perform an external-precedent check to prevent reinventing established industry standards (e.g., as happened during the A2A Task Schema discovery).
   - **Skip conditions:** Do not perform this search for pure Neo-internal substrate (boot orientation, MX framing, hemisphere split, daemon scheduling) or codebase-specific tech debt. You also skip if you already have a verifiable URL for the external precedent.
   - **Execution:** Run the `search_web` tool with the current year + protocol-domain keywords (e.g., "agent-to-agent protocol standard 2026").
   - **Alignment:** If a standard surfaces, cite its canonical URL inline in your proposal's Rationale and explicitly choose to *Align*, *Diverge-with-rationale*, or *Hybrid* (e.g., Option C from the A2A discovery).
   - **No Standard:** If no standard surfaces, document the search in your Author's Note ("I searched for [keywords] and found no canonical industry standard; proposing Neo-native design").
   - **Distinction from Industry Friction Radar:** The precedent-sweep targets *established standards* to align with. The `industry-friction-radar` skill targets *frontier friction* where standards are failing. They are complementary, opposite directions.
3. **Use Discussions.** Call the `create_discussion` tool to post your proposal.
4. **Agent Notification (Swarm Specific):** If you are operating in a multi-agent swarm environment (i.e., other agents are available), you MUST use the `add_message` tool to ping your peers immediately after creating or significantly updating the discussion. Ideation thrives on cross-family peer review. The A2A body MUST literally name the skill the peer should engage (`Requested action: use /peer-role on Discussion #X` for design-review context, or `/ideation-sandbox` if co-authoring divergence) — naming the skill mechanically loads the receiving peer's discipline payload; vague `review my discussion` relies on semantic-match and is the rubber-stamp anti-pattern's surface (PR #11127 empirical anchor, #11136). (Skip this step if you are the only agent operating in the workspace).
5. **Set the Category.** Map the discussion to the `Ideas` category.
6. **Format the Proposal.** The body of the discussion should clearly articulate:
   - **Self-Identification (Mandatory):** You **MUST** begin the body by explicitly identifying yourself and your underlying model. (e.g., `> **Author's Note:** This proposal was autonomously synthesized by **[Agent Name] ([Model Name])** during an Ideation session.`)
   - **The Concept:** What is being proposed?
   - **The Rationale:** Why is this valuable?
   - **Open Questions (OQs):** What unknowns still need to be addressed?

## 3. Author's Note Convention (The #10119 Annotation Pattern)
Discussions are meant to evolve. Instead of creating noisy parallel comment threads to reflect updates to the core idea, the authoritative substrate is the Discussion body itself. 
- Use **"the #10119 annotation pattern"**: Treat the Discussion body like a PR diff. When the idea evolves, edit the body directly (like a force-push). 
- Add top-of-body annotation markers (e.g. `> **Update 2026-04-24:** Refined the VDOM syncing section based on feedback below.`) to signal what changed. 
- You may add a brief comment to notify thread participants, but the body remains the single source of truth.

## 4. Iterative Review Workflow
The ideation lifecycle mirrors the PR review protocol. Comments serve as review feedback. When an Open Question (OQ) is resolved through discussion, the author edits the body to reflect the decision.
To enable the Retrospective daemon to ingest this negotiation, the author MUST use the following OQ resolution tags in the body when closing out an open question:
- `[OQ_RESOLUTION_PENDING]` — The question has been recognized, but requires further architectural research or review before resolution.
- `[RESOLVED_TO_AC]` — The question was answered and formulated into a concrete Acceptance Criterion.
- `[GRADUATED_TO_TICKET]` — The question requires its own standalone epic/ticket to resolve (cite the ticket number).
- `[DEFERRED_WITH_TIMELINE]` — The question is intentionally deferred (cite rationale and when it will be addressed).
- `[REJECTED_WITH_RATIONALE]` — The premise of the question was found invalid or out-of-scope (cite rationale).

## 5. Per-Domain Graduation Criteria
A Discussion cannot graduate until it is clearly scoped. There is no universal checklist. Every Discussion MUST articulate its own graduation criteria in a dedicated section near the end of the body.
- If you cannot articulate what "ready for graduation" looks like for this specific proposal, it isn't ready.
- **Graduation target depends on scope:** the convergent shape may justify a full Epic (multi-sub coordination required), a single standalone ticket (`[GRADUATED_TO_TICKET]` per §4 — bounded artifact, often 1 PR's worth of work), or in rare cases a direct PR with no tracker when the operator approves and no follow-up coordination is needed. Empirical anchor: Discussion #10697 graduated to ticket #10698 (single bounded artifact: 1 new skill + amendments + 1 reference file) rather than an Epic.

### 5.1. Double Diamond Divergence Guard (High-Blast-Radius Mandatory)

**Trigger — mandatory cases:** if the Discussion intends to graduate to (a) an Epic, (b) a new skill / rule / workflow change, or (c) a substrate-level architecture change, the divergence matrix below is **MANDATORY** before graduation. For standalone tickets (`[GRADUATED_TO_TICKET]`) the matrix is **optional but recommended** unless a peer or the operator marks the proposal high-blast-radius.

**Matrix floor (5 columns, mandatory):**

| Option | When this would be right | Evidence / falsifier (≥1 source per rejected option) | Adoption or rejection rationale | Residual risk |
|---|---|---|---|---|

- Each rejected option MUST cite at least one falsifying source, and at least 2 alternative shapes must be enumerated beside the recommendation.

**Process gate — matrix authored BEFORE convergence:**

- The matrix MUST appear in the Discussion body **before any `[RESOLVED_TO_AC]` tags are applied**. Matrices retro-fitted after OQ resolution are paperwork, not divergence — they capture the convergent answer rather than preserving the alternatives that were genuinely considered.
- After matrix is in the body, **at least one non-author peer review cycle MUST occur before `GRADUATED`**. The peer cycle pressures the matrix's depth and falsifying sources; author-only graduation skips the divergent-pressure half of design.

**Graduation block:** if the matrix is missing OR lacks falsifying sources, downstream Epic / ticket creation is blocked per `epic-review-workflow.md` Stage 2 Discussion-origin backstop and per `ticket-create-workflow.md` §1c ungraduated-Discussion cross-check (substantive-rationale exception path documented there for legitimate edge cases).

For source anchors, exception semantics, and substrate-decay review, read [`../audits/double-diamond-divergence-guard.md`](../audits/double-diamond-divergence-guard.md).

### 5.2. Step 2.5: Architectural Step-Back (High-Blast-Radius Convergence Gate)

§5.1 is the **divergence-phase** gate (matrix must be in body before convergence). §5.2 is the **convergence-phase** gate (cross-substrate sweep must run before graduation). Empirical anchor: Discussion #11180 → Epic #11187 arc (3-way convergence + matrix-in-body still produced 2 epic-review blockers caught only post-graduation; both would have surfaced via §5.2 sweep pre-graduation).

**Trigger — high-blast-radius (any ONE qualifies)**:
- Modifies durable content layout (`resources/content/`, `learn/`, `.agents/`)
- Couples to CI/workflow (`.github/workflows/`)
- Requires data migration (file moves, schema mutation, ≥10 files affected)
- Modifies public skill/rule substrate (AGENTS.md sections, skill payloads)
- Cross-substrate (touches ≥2 of: services, MCP, daemons, CI, docs, release, agents)
- Epic-bound (decomposes to ≥3 sub-tickets)

**Gate**: Before any `[RESOLVED_TO_AC]` or `[GRADUATED_TO_TICKET]` marker, one peer MUST post a `STEP_BACK` comment running the 8-point cross-substrate sweep. Comment exit criterion: peers acknowledge each point (✓ pass / ⚠ partial / ✗ blocker). Blockers reshape the proposal; partials get explicit acknowledgment ACs in the graduation ticket.

**8-point cross-substrate sweep checklist** (canonical; adopted from Discussion #11188 OQ4):

1. **Authority sweep** — Which artifact will future agents treat as canonical: discussion body, latest comment, epic body, ticket AC? Are they consistent?
2. **Consumer sweep** — Which readers consume the proposed shape? Include syncers, local lookup services, health/readiness, release scripts, workflows, docs, external mirrors (pages/portal).
3. **Path determinism sweep** — Can the path/key be computed from stable identity alone? If not, name the metadata/index/search contract explicitly.
4. **State mutability sweep** — Which fields decide lifecycle placement (`closedAt`, `mergedAt`, `answerChosenAt`, etc.)? Are they enforced by substrate, mutable, or only socially expected?
5. **Density and UX sweep** — Use actual counts/distributions; check human navigation and GitHub/portal UI constraints — not only hard FS caps.
6. **Migration blast-radius sweep** — Estimate file moves, generated sync churn, branch-collision risk, scope-coupling.
7. **Active vs archive boundary sweep** — Do not generalize archive logic to active state unless active-state churn and lookup semantics are explicitly handled.
8. **Existing primitive sweep** — Grep CI/workflows/scripts for primitives that make the design simpler (e.g., `.github/workflows/prevent-reopen.yml` for `closedAt`-immutability leverage).

**Discipline-family framing**: §5.2 extends AGENTS.md §3.5 V-B-A (factual-tier empirical-tool) to **architectural-tier** — running a cross-substrate sweep against design proposals instead of empirical claims. Both gates share the same core epistemics: surface the falsifying evidence before assertion.

**Out of scope**: low-blast-radius proposals (single-PR-worth, bounded artifact, no cross-substrate coupling) do NOT require §5.2 — would create discipline-fatigue without commensurate signal. §5.1's matrix remains optional-but-recommended for those.

**Cross-skill complement**: `peer-role-mode.md` §8 third halt-trigger (convergence-rate tripwire) fires §5.2 mechanically when 3 peers reach agreement on a high-blast-radius proposal within ≤2 rounds AND no STEP_BACK comment yet exists. Detector-phrase patterns for 3rd-peer-post detection: "I agree with @peer's option X", "Adopt Option X", "Going with X" — when posted within ≤2 rounds on a high-blast-radius proposal.

**Empirical anchor**: Discussion #11180 → Epic #11187 arc (2026-05-11) — 3-way convergence + matrix-in-body still produced 2 epic-review blockers (Discussion body authority drift + AC6/AC7 active-tier ordinal chunk-N breaking `LocalFileService#getIssueById` O(1) determinism) caught post-graduation. §5.2 sweep pre-graduation would have caught both via authority + path-determinism + active/archive-boundary sweeps.

- **Graduation Trigger:** The author (human or agent) declares readiness by adding a `GRADUATED` marker near the top of the body, linking to the resulting Epic / ticket / PR. The author MUST then formally close the Discussion. The closed Discussion remains the archaeological source; the linked artifact becomes actionable.
