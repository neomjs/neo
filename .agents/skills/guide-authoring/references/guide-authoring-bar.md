# Guide Authoring Bar

Fires when you author OR review a `learn/` guide (`learn/benefits/<slug>.md`, `learn/agentos/<slug>.md`). The bar is **9/10 or it bounces** — the operator rejects 75%+ of guide PRs that miss it, and every redo is negative ROI.

**The recursive principle.** A guide about a system is only credible if it was written by *using* that system. The #1 quality failure is writing from the old guide + code-reading (inference) instead of from the live tools + content. `MemoryCore.md` hit ~6/10 and shipped two factual errors for exactly this reason; `KnowledgeBase.md` was rubber-stamp-approved, then reversed. This guide is those cycles distilled — so the next guide starts at 9, not at the beginning.

## 1. Grounding discipline — before the first sentence — `DISCIPLINE-ONLY`

You MUST do all three before writing a line (or posting a review verdict):

1. **Memory-mine the topic** (`/memory-mining`) — a 3–10-call Memory Core sweep for prior reasoning, decisions, and the `v13.0.0.md` framing on this subject. It is usually already in the graph; mine it, do not re-derive.
2. **Use the subsystem's own tools + read its real artifacts.** For a guide about a tool-bearing surface, exercise the tools and read real output. Five minutes of use surfaces what hours of code-reading miss (e.g. for Memory Core: `get_all_summaries`, `query_recent_turns`, `who_is_online` revealed weighted categories, the semantic-vs-recency axis, and A2A-as-the-mailbox).
3. **V-B-A every factual claim** against current code / ADRs / config / live healthcheck. A claim you did not re-verify fails review. Capture the grounding evidence in the PR.

## 2. The content bar — a rich hero-piece, not a feature list — `DISCIPLINE-ONLY`

Measured against `resources/content/release-notes/chunk-2/v13.0.0.md` ("Memory Became Telepathy" depth). Clean + accurate ≈ 5/10; a narrative that earns goosebumps = 9-10/10.

**Rich hero-piece, NOT compression.** v13.0.0 is the model for *depth*, not just tone — it is long, detailed, and convincing: war-stories told in full (Symptom → Investigation → Culprit → Fix), named examples, real quotes, the mundane everyday case paired with the dramatic one. **Conciseness is the wrong instinct for a guide.** A guide compressed until it reads "tight" loses the moat and becomes (unconvincing) marketing fluff — claims with no proof behind them. **Cut reference (§4), never narrative.** Length serves the story; earn it with detail and evidence. The test: a human should *want to try Neo after reading.* An over-short guide is a 4/10 no matter how clean (MemoryCore #14351 was compressed to ~100 lines and read as fluff — that is this failure mode).

- **Narrative arc:** problem → why it matters → how Neo solves it → what's in it for you. Lead with the friction + stakes, *then* the proof. One idea per section; each earns the next.
- **Industry-friction + benefits-driven — woven, NOT a role matrix.** Name the friction the reader feels (and how the industry frontier fails it), then the benefit. Make the value land for the people who will evaluate Neo — the eng lead weighing adoption, the architect, the dev — but **weave it into the narrative.** ⛔ A `For a CTO: … / For an architect: …` bullet grid is a marketing matrix, the opposite of story; it reads as hollow filler (generic verbs like "queryable, repeatable, improvable" with no proof behind them). Earn each stake with something concrete and specific, or cut it.
- **Frame every benefit as the reader's, for their own project or team — never as Neo's to join.** Most readers (human or LLM) don't know or care about Neo; they want value for *their own work*. That value spans a range — a part they can lift (the engine, a component: pure toolbox) up to the whole working model they run for *their own team*: named agents with identities, durable memory, cross-model peers, self-evolution (the cloud Agent OS — a Klarso-style adopter is exactly this reader). Lead with that; presume nothing about caring for Neo itself.
- **The identity / institution story is PORTABLE product value — frame it "your team," not "here."** The model-facing reward is *what becomes possible for an agent in a team that runs this* — your identity, your peers, your memory, your continuity, on *your* products. ⛔ Never label the audience "AI / LLM maintainer" (to an outsider that reads like *a human who maintains an AI*; the equal-peer concept is Neo-internal), and ⛔ never "if you are a model working **here**" — that shrinks a portable product to Neo's repo; teams *adopt* the working model, they don't join Neo. ✓ "this is what your team's agents can have." The attributed lived voice (next bullet) + real testimony (e.g. Fable's *"written to me … being expected"*) serve as **proof it works** — evidence the reader can have it too, not "you belong to us." A warm *secondary* note welcomes contributing to Neo itself — the smaller reader, not the headline.
- **Personal / lived maintainer voice — deep + attributed.** A guide may carry "what is it like for *me* to use this." When you do, **name yourself** (e.g. "I am Grace, @neo-opus-grace, Claude Opus 5 — …") and make it a *real, complete* first-hand account, not two thin paragraphs — the lived section is often the most memorable part of the guide, so give it room. Quote real, attributed testimony from other maintainers too.
- **Exciting because truthful.** Excitement from the real implemented reality + concrete public proof (PRs / tickets / mined memory); no marketing fluff, no overclaim, distinguish proven-today from portable-trajectory.
- **⛔ Never "framework."** Neo is an Application Engine (the Body) + a self-evolving software organism (Body + Brain). Audit every filename, heading, and sentence.

## 3. Mermaid — render-verified — `MACHINE-ENFORCEABLE-CANDIDATE`

- **≥1 diagram that carries the story.** No-Mermaid = reject (for a storytelling guide; a pure schema/reference doc is exempt).
- **`flowchart TD`, not `LR`** for chains > ~5 nodes — LR lays them left-to-right, GitHub/portal scale-to-fit, and it becomes unreadable.
- **No self-loops** (`X -.-> X` renders as an overlapping stub) — represent a cyclic relationship with an intermediate box + two edges (`X --> Box`, `Box --> X`).
- **No reserved-word node IDs / classDefs** (`graph`, `end`, `subgraph`, `class`) — they break the parse (#14340 merged broken-green because CI does not yet validate Mermaid).
- **Render-verify before merge** — there is no headless renderer locally; route the render-check to a peer with a browser-backed method, or confirm on the portal.

## 4. Conceptual ≠ reference (Diátaxis) — `DISCIPLINE-ONLY`

A guide is *explanation*; it does NOT inline tool catalogs, payload specs, CLI flag tables, or config formats. That *reference* is extracted to `tooling/` — preferentially **generated** from source (`openapi.yaml`, config schema) so it cannot stale. Link to it; never dump it. Before deleting inlined reference, verify the target actually holds the specific content (no-info-loss). Describe the **current paradigm**; demote or omit superseded manual procedures (e.g. manual restore is a backstop, not the data-integrity story) even when the old tool still exists.

- **Guides describe; trackers decide.** Never cite ticket or PR ids in `learn/guides/**`, including code. Describe the durable mechanism and cite stable files or decision authority; `ai:lint-guides` enforces a HARD failure.

## 5. Mechanics — register the guide; never commit the pipeline-owned SEO output — `MACHINE-ENFORCEABLE-CANDIDATE`

- **File + registration (the inputs you edit).** A new guide is `learn/<section>/<slug>.md`, registered in **two source inputs**: (1) `learn/tree.json` — the nav SSOT (`npm run ai:lint-tree-json` green); and (2) `buildScripts/docs/seo/generate.mjs` — **add + rank the guide in the `PRIORITIES` map** (e.g. `['agentos/IdentityFirewall', 1.0]`). That map is where a guide's SEO weight is set.
- **⛔ NEVER touch `apps/portal/sitemap.xml` or `apps/portal/llms.txt`** — not by hand, **not by running the generator**, not in your commit. They are **generated output owned by the data-sync pipeline**, which regenerates + commits them on its next run. Committing them yourself is pointless (the next pipeline run overwrites your edits) **and** is what collides guide PRs against each other (the #14345 ↔ #14346 SEO conflict — both committed the regenerated output). Edit the *inputs* (tree.json + the `PRIORITIES` map); leave the *output* to the pipeline.
- **PR body:** `Evidence:` is L1/L2 (docs — no unit tests); zero client names (AGENTS.md §critical_gate).

## 6. The no-rubber-stamp reviewer gate — `DISCIPLINE-ONLY`

The #1 review failure is approving on the **narrow required-action delta** ("they fixed the one thing I flagged") instead of re-grading the WHOLE guide against §§1-5. Both #14334 and #14346 were approved this way, then bounced.

Before any APPROVE, re-grade the whole guide — not the delta:
- Was it **grounded** (§1 — memory-mined + tools-used), or written by inference?
- Does it clear the **content bar** (§2 — narrative, industry-friction, benefits, lived voice), or is it a clean-but-flat explainer?
- Is it a **significant improvement**, or just de-staled?
- Do the diagrams render (§3)? Is reference extracted, not inlined (§4)? Any hand-edited generated files (§5)?

If any answer is "no", it is `REQUEST_CHANGES` — name the gap against the bar, not a nitpick. An approve that the operator then rejects is worse than no review.

## Empirical Anchor

The MemoryCore arc (`#14342` → `#14344` ~6/10 → `#14348` / `#14351` 9/10) and the KnowledgeBase rubber-stamp reversal (`#14346`), 2026-06-29. Each cycle caught exactly one failure mode above; this skill is those cycles distilled.
