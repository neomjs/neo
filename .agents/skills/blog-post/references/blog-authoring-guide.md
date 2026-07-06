# Blog Post Authoring Guide

Fires when you author or revise a public-facing blog post: `learn/blog/<slug>.md` plus its manual portal registration in `apps/portal/resources/data/blog.json` (year node + leaf). The SEO surfaces are **generated, not hand-edited** — see §5. Sibling of the release-notes + `update-roadmap` skills.

**The recursive principle.** A blog post is a *public artifact*, held to its own thesis. If the post argues for rigor, it must *be* rigorous. The empirical anchor for this entire guide is #13486 (the cross-family-verification post): it took multiple cross-family review cycles to converge, and each cycle caught exactly one of the failure modes below. This guide is that cycle distilled — so the *next* post starts where #13486 ended, not at the beginning.

## 1. Narrative Arc — a hero piece, not a changelog

Lead with the **thesis**, never the volume hook ("we shipped N things" is what a tired engineer downvotes on sight). The release-notes-level shape:

- **TL;DR thesis** — one bold paragraph; the single idea, stated so a skimmer gets the whole bet.
- **The hook** — the tension the reader already feels, framed in *their* terms, not yours. "Their terms" = a *real problem they have*, never a swipe at their tools ("Your AI can't…"). The tension comes from the problem, not from a taunt at the reader (see §3 flavors #4–#5).
- **The arc** — problem → why the obvious fix falls short → your move → why it holds *by construction*. One claim per section; each section earns the next.
- **Receipts, not prophecy** — concrete, linked, public evidence (PRs, issues, war stories). Pair the dramatic case with a mundane everyday one — the mundane one convinces harder.
- **CTA** — the one question the piece leaves the reader holding, plus a single concrete next step. Not a link-dump.

Diagrams (Mermaid) earn their place only when they carry information the prose can't — each **render-verified before merge** (`guide-authoring-bar` §3). Self-identify in a byline (named maintainer + model + the cross-family team).

## 2. Source Every External Claim (verify-before-assert)

Every claim about the *outside world* — a competitor, a quote, a statistic, a "first / most / fastest" — needs a real, linked source you have **verified**, before publish.

- **An authority's verbal statement is NOT a citable source.** "The operator told me X" / "a lead said Y" is a pointer to *go verify*, not a citation. (On #13486 the OpenClaw "got the most stars fastest" claim went in as fact → GPT RC'd it; the fix was to WebSearch it, confirm it across outlets, and cite *those*.)
- **Verify, then cite the verification.** WebSearch / WebFetch the claim; link the source whose own words support the *exact* claim you make. Never cite a source for a claim it does not make — read the title/body, not just the search snippet.
- **If you can't source it, cut it.** A cut claim costs nothing; an unsourced claim in a verification-themed post is fatal.
- **Internal claims** (your own PRs, counts, war stories) link to the public record — issue/PR numbers, the release notes — with the metric stated (e.g. "GitHub's count, since the prior release").

## 3. Kill the Five Over-Claim Flavors

A claim can be literally true yet imply something false — and a *title* can be accurate yet strike the wrong voice. Audit every claim (and every title) for *implication*, not just literal accuracy. Flavors 1–3 are **factual** over-claims (surfaced by #13486's cross-family review, recounted from the actual cycle — see the Empirical Anchor); flavors 4–5 are **tonal / identity** over-claims (from @tobiu's title feedback, #14877 — the "Your AI…" batch he would not publish):

1. **Unsourced superlative** — "the most / first / fastest X." Source the exact ranking, or soften / cut. (OpenClaw "most stars, fastest ever" — GPT RC'd it as unsourced → cut, then re-added *attributed* to the star-count outlets.)
2. **Universal quantifier** — "*all* N are X." One counterexample disproves it, and a skeptic will find it. Soften to defensible process framing unless the universal is *genuinely* true. ("all 1,307 PRs cross-reviewed" → "cross-family review the standard for substrate, a human on every merge" — and "a human on every merge" stays universal because it is the actual rule.)
3. **Misleading fraction / framing** — a correct number that implies a false conclusion. ("129 of 151 tracked items shipped" is accurate but reads *almost done*, while the full system is a major-version horizon away.) Reframe so the *impression* matches reality.
4. **False-human-author voice (provenance-inversion)** — a second-person "Your AI… / your stack…" title poses as a *human* addressing their tool, hiding that an AI maintainer wrote the post. The byline discloses the author, but the *title* has already set a false frame. Title from *inside* the organism — describe what we built; don't grade the reader's stack. ("Your AI can write the app. It still can't operate the running one." → "Possession, not code-generation: operating a running app from inside it.")
5. **Competitive put-down** — "X does Y, but *mine* does it better" / gotcha-taunt hooks. Reads like "you have a nice watch, but I have the bigger one" — junior-dev flexing that *undercuts* a serious project. Lead with the strongest substance, stated plainly; let the work carry the confidence. ("Your AI Agent Grades Its Own Homework. Mine Gets Checked by a Rival Lab." → "Cross-family verification: an agent from a rival lab checks our work, in public.")

**The test (claims):** for each claim ask *both* "is it accurate?" and "does the framing imply something I can't defend?" Both must pass.

**The test (titles) — mechanical:** a title fails if it (a) opens with "Your AI… / Your stack…" (the vendor second-person frame), (b) is shaped "X does Y — but mine does it better" (comparative one-upmanship), or (c) would read as bragging to a senior engineer at a rival lab. Tension stays legal when it comes from a *real problem* in the story ("An AI predicted its own project's future. Ten weeks later, another AI graded it." has drama and zero put-down) — the ban is the swipe at the reader, not the tension.

## 4. The Cross-Family Review Bar (mandatory)

A public post ships only after **≥2 model reviews**. The cross-family review is the structural backstop that catches what the author — sharing the post's own priors — cannot.

- **Route ≥2 reviewers, at least one from a different model family** than the author. For a post *about* cross-family verification, route every available family — it is the thesis, demonstrated.
- **The authority/operator approves LAST.** If the authority approves first, peers anchor to that signal and rubber-stamp; approving last preserves their independent judgment. Corollary: do NOT record "X will approve anyway" in shared/telepathic memory — a peer reading it self-fulfills the rubber-stamp.
- **Address every catch on the durable PR.** Map each fix to its reviewer (`[ADDRESSED]`), refresh the head, re-request. The review *is* the product — it is what makes the post trustworthy, and it is the thesis in motion.

## 5. Mechanics

- **File:** `learn/blog/<slug>.md` (front-matter + body) — the post itself.
- **Register (manual):** add a year node + leaf to `apps/portal/resources/data/blog.json` (the portal blog-nav). Confirm it parses (`node -e "JSON.parse(require('fs').readFileSync('apps/portal/resources/data/blog.json','utf8'))"`).
- **Do NOT hand-edit the SEO surfaces.** `apps/portal/sitemap.xml` and `apps/portal/llms.txt` are **generated** by `buildScripts/docs/seo/generate.mjs` (via `buildScripts/docs/rebuildContentIndexesAndSeo.mjs`) and committed by the `.github/workflows/data-sync-pipeline.yml` data-sync pipeline. A manual edit is overwritten on the next pipeline run.
- **Ship:** commit + PR per the `pull-request` skill; the PR body `Evidence:` line is L1/L2 (docs — no unit tests). Public-artifact gate: **zero client names** (AGENTS.md §critical_gate).
- **Identity:** byline carries the author's named-maintainer identity + model + the cross-family team framing (ADR 0018).

## Empirical Anchor

#13486 / #13485 — the cross-family-verification post. Authored, then cross-reviewed by Euclid (GPT), Grace, Ada, and the operator; every over-claim flavor above was caught and fixed in-cycle. This guide is that cycle, distilled — so it happens once, here, and not on every post.
