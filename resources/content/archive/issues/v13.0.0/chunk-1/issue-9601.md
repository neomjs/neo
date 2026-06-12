---
id: 9601
title: Enhance SSR Proxy to Serve Raw Markdown for llms.txt Optimization
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-03-30T21:53:53Z'
updatedAt: '2026-03-30T22:41:08Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9601'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-03-30T22:41:08Z'
---
# Enhance SSR Proxy to Serve Raw Markdown for llms.txt Optimization

Currently, the `llms.txt` generation in the `neo` repository points AI crawlers to the deep application HTML routes. While this works, it forces AI agents to parse complex HTML DOMs, which is highly inefficient and prone to token bloat.

To establish true Generative Engine Optimization (GEO):
1. The `middleware-v2` reverse proxy server must be updated to explicitly intercept and serve our repository's `.md` files natively via a new `/raw/*` API endpoint (drawing directly from the `node_modules/neo.mjs/` paths that `fetchContent.mjs` synchronizes).
2. The `neo` SEO generation script (`buildScripts/docs/seo/generate.mjs`) must be refactored to point `llms.txt` to these new direct Markdown endpoints.

This will provide AIs like OpenAI and Anthropic with pure, high-signal data.

## Timeline

- 2026-03-30T21:53:55Z @tobiu added the `enhancement` label
- 2026-03-30T21:53:55Z @tobiu added the `ai` label
- 2026-03-30T22:26:40Z @tobiu referenced in commit `8489ac8` - "feat: use O(1) tracking map for raw routes instead of fast-glob (#9601)"
- 2026-03-30T22:39:38Z @tobiu referenced in commit `7fae1f1` - "fix: properly scope llms.txt human UI description to content endpoints only (#9601)"
- 2026-03-30T22:41:00Z @tobiu assigned to @tobiu
- 2026-03-30T22:41:08Z @tobiu closed this issue

