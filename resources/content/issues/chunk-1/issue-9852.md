---
id: 9852
title: 'feat: Migrate high-signal Medium blog posts to learn/blog/ Markdown (SSG+ indexing)'
state: OPEN
labels:
  - documentation
  - enhancement
  - ai
assignees: []
createdAt: '2026-04-10T08:58:33Z'
updatedAt: '2026-04-10T08:58:33Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9852'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
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

