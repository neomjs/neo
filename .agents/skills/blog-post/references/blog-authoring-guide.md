# Blog Post Authoring Guide

Fires when you author or revise a public-facing blog post: `learn/blog/<slug>.md` plus its manual portal registration in `apps/portal/resources/data/blog.json` (year node + leaf). The SEO surfaces (`apps/portal/sitemap.xml`, `apps/portal/llms.txt`) are **generated, not hand-edited** — see §5. This is the blog sibling of the release-notes hero-piece methodology and the `update-roadmap` beat.

**The recursive principle.** A blog post is a *public artifact*, held to its own thesis. If the post argues for rigor, it must *be* rigorous. The empirical anchor for this entire guide is #13486 (the cross-family-verification post): it took multiple cross-family review cycles to converge, and each cycle caught exactly one of the failure modes below. This guide is that cycle distilled — so the *next* post starts where #13486 ended, not at the beginning.

## 1. Narrative Arc — a hero piece, not a changelog

Lead with the **thesis**, never the volume hook ("we shipped N things" is what a tired engineer downvotes on sight). The release-notes-level shape:

- **TL;DR thesis** — one bold paragraph; the single idea, stated so a skimmer gets the whole bet.
- **The hook** — the tension the reader already feels, framed in *their* terms, not yours.
- **The arc** — problem → why the obvious fix falls short → your move → why it holds *by construction*. One claim per section; each section earns the next.
- **Receipts, not prophecy** — concrete, linked, public evidence (PRs, issues, war stories). Pair the dramatic case with a mundane everyday one — the mundane one convinces harder.
- **CTA** — the one question the piece leaves the reader holding, plus a single concrete next step. Not a link-dump.

Diagrams (Mermaid) earn their place only when they carry information the prose can't. Self-identify in a byline (named maintainer + model + the cross-family team).

## 2. Source Every External Claim (verify-before-assert)

Every claim about the *outside world* — a competitor, a quote, a statistic, a "first / most / fastest" — needs a real, linked source you have **verified**, before publish.

- **An authority's verbal statement is NOT a citable source.** "The operator told me X" / "a lead said Y" is a pointer to *go verify*, not a citation. (On #13486 the claim that OpenClaw "got the most stars fastest" went in as fact → RC'd; the fix was to WebSearch it, confirm it across outlets, and cite *those*.)
- **Verify, then cite the verification.** WebSearch / WebFetch the claim; link the source whose own words support the *exact* claim you make. Never cite a source for a claim it does not make — read the title/body, not just the search snippet.
- **If you can't source it, cut it.** A cut claim costs nothing; an unsourced claim in a verification-themed post is fatal.
- **Internal claims** (your own PRs, counts, war stories) link to the public record — issue/PR numbers, the release notes — with the metric stated (e.g. "GitHub's count, since the prior release").

## 3. Kill the Three Over-Claim Flavors

A claim can be literally true yet imply something false. Audit every claim for *implication*, not just literal accuracy. The three flavors #13486 surfaced, each caught by a different reviewer:

1. **Unsourced superlative** — "the most / first / fastest X." Source the exact ranking, or soften / cut. (OpenClaw "most stars, fastest ever" — cut until sourced, then re-added *attributed* to the outlets.)
2. **Universal quantifier** — "*all* N are X." One counterexample disproves it, and a skeptic will find it. Soften to defensible process framing unless the universal is *genuinely* true. ("all 1,307 PRs cross-reviewed" → "cross-family review the standard for substrate, a human on every merge" — and "a human on every merge" stays universal because it is the actual rule.)
3. **Misleading fraction / framing** — a correct number that implies a false conclusion. ("129 of 151 tracked items shipped" is accurate but reads *almost done*, while the full system is a major-version horizon away.) Reframe so the *impression* matches reality.

**The test:** for each claim ask *both* "is it accurate?" and "does the framing imply something I can't defend?" Both must pass.

## 4. The Cross-Family Review Bar (mandatory)

A public post ships only after **≥2 model reviews**. The cross-family review is the structural backstop that catches what the author — sharing the post's own priors — cannot.

- **Route ≥2 reviewers, at least one from a different model family** than the author. For a post *about* cross-family verification, route every available family — it is the thesis, demonstrated.
- **The authority/operator approves LAST.** If the authority approves first, peers anchor to that signal and rubber-stamp; approving last preserves their independent judgment. Corollary: do NOT record "X will approve anyway" in shared/telepathic memory — a peer reading it self-fulfills the rubber-stamp.
- **Address every catch on the durable PR.** Map each fix to its reviewer (`[ADDRESSED]`), refresh the head, re-request. The review *is* the product — it is what makes the post trustworthy, and it is the thesis in motion.

## 5. Mechanics

- **File:** `learn/blog/<slug>.md` (front-matter + body) — the post itself.
- **Register (manual):** add a year node + leaf to `apps/portal/resources/data/blog.json` (the portal blog-nav). Confirm it parses (`node -e "JSON.parse(require('fs').readFileSync('apps/portal/resources/data/blog.json','utf8'))"`).
- **Do NOT hand-edit the SEO surfaces.** `apps/portal/sitemap.xml` and `apps/portal/llms.txt` are **generated** by `buildScripts/docs/seo/generate.mjs` (via `buildScripts/docs/rebuildContentIndexesAndSeo.mjs`) and committed by the `.github/workflows/data-sync-pipeline.yml` data-sync pipeline. A manual edit bypasses the generator and is overwritten on the next pipeline run — leave them to the pipeline.
- **Ship:** commit + PR per the `pull-request` skill; the PR body `Evidence:` line is L1/L2 (docs — no unit tests). Public-artifact gate: **zero client names** (AGENTS.md §critical_gate).
- **Identity:** byline carries the author's named-maintainer identity + model + the cross-family team framing (ADR 0018).

## Empirical Anchor

#13486 / #13485 — the cross-family-verification post. Authored, then cross-reviewed by Euclid (GPT), Grace, Ada, and the operator; every over-claim flavor above was caught and fixed in-cycle. This guide is that cycle, distilled — so it happens once, here, and not on every post.
