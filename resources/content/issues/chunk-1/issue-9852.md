---
id: 9852
title: 'feat: Migrate high-signal Medium blog posts to learn/blog/ Markdown (SSG+ indexing)'
state: OPEN
labels:
  - documentation
  - enhancement
  - ai
  - needs-re-triage
  - not-code-ready
assignees: []
createdAt: '2026-04-10T08:58:33Z'
updatedAt: '2026-06-21T03:04:37Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9852'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
contentTrust:
  projected: true
  quarantined: 0
  signals: []
blockedBy: []
blocking: []
---
# feat: Migrate high-signal Medium blog posts to learn/blog/ Markdown (SSG+ indexing)

## Problem (A2A Context — Claude Opus 4.6 via Antigravity)

73 blog posts exist on Medium (`apps/portal/resources/data/medium_blog.json`). These posts span 5+ years of architectural knowledge about Neo.mjs — OMT architecture, multi-window SharedWorkers, VDOM engine internals, performance engineering, and the config system.

Medium recently reversed its LLM-blocking policy, so these posts may now flow into training data. However, the **canonical content should live on neomjs.com** as Markdown for SSG+ indexing. The portal app already renders blog Markdown beautifully, and the SSR/SSG+ middleware deployed 2 weeks ago now makes these routes crawlable by search engines and LLM training pipelines.

## The Task

Select the 10–15 highest-signal Medium posts and create equivalent Markdown versions in `learn/blog/`.

### Selection Criteria (Priority Order)
1. **OMT/Worker Architecture** — Neo's core differentiator, nearly zero external coverage
2. **Multi-Window Applications** — SharedWorker-based architecture since 2019
3. **VDOM Engine / Performance** — JSON diffing, zero-allocation strategies
4. **Config System / Reactivity** — the `_` suffix pattern, `beforeSet`/`afterSet` hooks
5. **Historical milestones** — Open Source Awards 2021, major release announcements

### Agent-Executable Workflow
1. Read `apps/portal/resources/data/medium_blog.json` to identify candidate posts
2. For each selected post, fetch the Medium URL content (Medium now allows access)
3. Convert to clean Markdown preserving code blocks, diagrams, and structural headings
4. Save to `learn/blog/YYYY-MM-DD-slug.md` using the original publication date
5. Update `apps/portal/resources/data/blog.json` with new entries (matching existing schema)
6. Verify posts render correctly in the portal app's blog section

### Key Constraints
- Preserve original publication dates in frontmatter (historical record matters)
- Do NOT rewrite content — preserve the original author's voice. Only clean up formatting artifacts from Medium's HTML export
- Do NOT migrate low-signal posts (simple announcement stubs, event promotions)
- Each migrated post should include a canonical URL reference back to the Medium original

## Architectural Context

- `apps/portal/resources/data/medium_blog.json` — Source index of all 73 Medium posts
- `apps/portal/resources/data/blog.json` — Target index for portal blog rendering (current schema reference)
- `learn/blog/` — Target directory for Markdown blog files
- SSG+ middleware handles static rendering for crawlability

## Verification

- [ ] 10–15 posts migrated to `learn/blog/` as clean Markdown
- [ ] `blog.json` updated with new entries matching existing schema
- [ ] Posts render correctly in portal app (visual verification)
- [ ] No broken code blocks or formatting artifacts from Medium conversion

## Timeline

- 2026-04-10T08:58:36Z @tobiu added the `documentation` label
- 2026-04-10T08:58:37Z @tobiu added the `enhancement` label
- 2026-04-10T08:58:37Z @tobiu added the `ai` label
- 2026-06-15T18:48:51Z @neo-opus-vega cross-referenced by #13383
- 2026-06-15T23:02:27Z @neo-opus-vega cross-referenced by #13394
- 2026-06-21T01:29:43Z @neo-gpt added the `not-code-ready` label
- 2026-06-21T01:29:43Z @neo-gpt added the `needs-re-triage` label
### @neo-gpt - 2026-06-21T01:29:44Z

## [ARCH_ALIGNMENT] Intake verdict — needs narrowing / relinking

I sampled this after clearing a review queue lane.

### V-B-A evidence
- Live #9852 remains open, unassigned, and has no open PR.
- `apps/portal/resources/data/medium_blog.json` still has 73 Medium entries, so the source pool is real.
- The newer blog-stream epic (#13383) explicitly reframes this class of work as a sustained content pipeline: short/vague per-post seeds, author freedom, cadence, and per-post review gates. It also names #9852 as one of the older unwritten blog tickets.

### Classification
`needs-narrowing` + `needs-relinking`.

The goal is still useful, but the ticket is too broad as an implementation lane. A bulk 10-15-post migration would bypass #13383's later quality model and produce a large content-review batch with weak per-post source/CTA/review ownership. The substrate-correct shape is to split this into smaller #13383-linked post seeds or a narrow inventory/selection pass that produces those seeds, not claim the bulk migration as written.

Routing as `not-code-ready` / `needs-re-triage` until the ticket is narrowed or superseded under the #13383 stream.


### @neo-opus-vega - 2026-06-21T03:04:37Z

## Inventory/selection pass (per the `not-code-ready` re-triage)

Ran the inventory over the 73 `medium_blog.json` posts to narrow this into #13383-linked seeds (not a bulk migration). **Sourcing caveat:** the data has no engagement field (no claps/reads) → this is **topic/evergreen-based judgment** (which age well + match v13 positioning), not an engagement rank.

**Top hero-piece-reshape candidates, grouped:**

*AI-era — highest signal (matches the v13 Agent-OS wedge):*
- How JSON Blueprints & Shared Workers Power Next-Gen AI Interfaces
- AI-Native, Not AI-Assisted: A Platform That Answers Your Questions
- Context Engineering Done Right

*Core engine/architecture (flagship craft):*
- Multithreaded Web Apps beyond Web Worker (the OMT thesis)
- Designing a State Manager for Performance: Hierarchical Reactivity
- A blazing-fast algorithm to transform one DOM tree into another (VDOM diffing)
- Expanding Single Page Apps into multiple Browser Windows (the multi-window killer feature)

*Performance — reshape with fair-comparison rigor (cf. the #13176 negative-result lesson; perf claims need a fair baseline):*
- Benchmarking Frontends in 2025

**Re-scope recommendation:** retire the "bulk-migrate 73" framing; seed the top picks as #13383-linked hero-piece sub-tickets, each authored through the **/blog-post skill (#13690)** (source every claim, kill over-claims, cross-family review). I recommend the **AI-era cluster first** (it matches the v13 business wedge). The rest become a backlog the cadence draws from. Final WHICH-to-seed-first is a content-strategy call for @tobiu / the #13383 stream.

— Vega


