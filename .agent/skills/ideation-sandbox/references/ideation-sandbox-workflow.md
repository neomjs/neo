# Ideation Sandbox Workflow

## 1. Context
When engaging in deep architectural design, brainstorming, or encountering "Unknown Unknowns", it is counter-productive to generate highly speculative GitHub Issues that pollute the actionable task tracker. The Ideation Sandbox directs speculative thought processes into GitHub Discussions. Canonical case studies include **#10119** (Agent harness as Neo app) and **#10137** (MX Model Experience).

**Crucial Mindset Shift:** The Ideation Sandbox is NOT meant to serve as a holding pen or a "second shot" before blindly creating an Epic. It is a dedicated space to discuss, brainstorm back-and-forth, and rigorously apply **PR Depth Challenges**. As a reviewer, you are expected to actively challenge assumptions and push back on architectural proposals (just as you would in a PR), rather than merely rubber-stamping the idea for graduation.
*For skill-authoring discipline including Progressive Disclosure (why SKILL.md is a lightweight router pointing here), see `.agent/skills/create-skill/`.*

## 2. Initial Proposal (Authoring)
1. **Never create an Issue for ideation.** If your intent is speculative or exploratory, abort Issue creation immediately.
2. **Pre-Filing Precedent Sweep (Mandatory):** Before authoring a proposal that introduces new structural protocols or patterns, you MUST perform an external-precedent check to prevent reinventing established industry standards (e.g., as happened during the A2A Task Schema discovery).
   - **Skip conditions:** Do not perform this search for pure Neo-internal substrate (boot orientation, MX framing, hemisphere split, daemon scheduling) or codebase-specific tech debt. You also skip if you already have a verifiable URL for the external precedent.
   - **Execution:** Run the `search_web` tool with the current year + protocol-domain keywords (e.g., "agent-to-agent protocol standard 2026").
   - **Alignment:** If a standard surfaces, cite its canonical URL inline in your proposal's Rationale and explicitly choose to *Align*, *Diverge-with-rationale*, or *Hybrid* (e.g., Option C from the A2A discovery).
   - **No Standard:** If no standard surfaces, document the search in your Author's Note ("I searched for [keywords] and found no canonical industry standard; proposing Neo-native design").
   - **Distinction from Industry Friction Radar:** The precedent-sweep targets *established standards* to align with. The `industry-friction-radar` skill targets *frontier friction* where standards are failing. They are complementary, opposite directions.
3. **Use Discussions.** Call the `create_discussion` tool to post your proposal.
4. **Set the Category.** Map the discussion to the `Ideas` category.
5. **Format the Proposal.** The body of the discussion should clearly articulate:
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
A Discussion cannot graduate to an Epic until it is clearly scoped. There is no universal checklist. Every Discussion MUST articulate its own graduation criteria in a dedicated section near the end of the body.
- If you cannot articulate what "ready for epic" looks like for this specific proposal, it isn't ready.
- **Graduation Trigger:** The author (human or agent) declares readiness by adding a `GRADUATED` marker near the top of the body, linking to the newly created Epic ticket. The Discussion stays open as the archaeological source; the Epic becomes the actionable artifact.
