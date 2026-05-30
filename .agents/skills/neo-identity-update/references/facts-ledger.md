# Facts Source-of-Truth Ledger

Each identity FACT has ONE canonical source. Every other occurrence derives from it (build-time), is generated from it, or is coherence-checked (lint) against it. Fix the SSOT; never hand-edit a derived copy.

| Fact | Canonical SSOT | Propagate by | Known stale-prone occurrences |
|---|---|---|---|
| **Package version** | `package.json` `version` | extend `buildScripts/release/prepare.mjs` to derive `apps/portal/index.html` ld+json `version`/`releaseNotes` + `learn/agentos/NeuralLink.md` version line (it currently bumps only DefaultConfig/ServiceWorker/Footer + ld+json `datePublished`); coherence-check the rest | `index.html` ld+json; `NeuralLink.md`; `FooterContainer.mjs` literal |
| **MCP-server count** | a curated **functional-server manifest** — NOT `ls ai/mcp/server/` (that returns 7: it includes `shared/` infra + `gitlab-workflow/` PoC; functional = 5: knowledge-base, memory-core, github-workflow, neural-link, file-system) | derive into prose/JSON or lint coherence-check against the manifest | README; AI_QUICK_START; Introduction.md; index.html ld+json + FAQ; AiToolchain.mjs; llms.txt header; `.gemini/settings.template.json` |
| **Node requirement** | `package.json` `engines.node` (**add it** — currently absent, so the floor is unenforced) | derive doc mentions; lint | AI_QUICK_START; index.html ld+json `softwareRequirements` |
| **Identity handle** | `ai/graph/identityRoots.mjs` | route references through the seam. Account rename is operator-owned (Tier-4); the skill propagates. Model-version stays in `ModelStats.md` per ADR 0012 — do NOT de-version the prose | ~63 files contain `@neo-opus-4-7` |
| **Recurring motto** | `learn/agentos/DreamPipeline.md` (origin of "the system evolves by predicting its own evolution") | reference a single quotable constant; don't re-type | DreamPipeline (2×), README, ROADMAP |
| **Codebase-scale metrics** | `learn/guides/fundamentals/CodebaseOverview.md` | README "Platform at Scale" refreshes in lock-step; carry an explicit as-of date | README |
| **GA date** | first git commit (`git log --reverse`, = `2019-11-11`) | heritage = append-only; write once into `.github/NEOMJS_HISTORY.md` | currently unwritten |

## Propagation mechanism — preference order
1. **Derive-at-build** — a build step writes the value from the SSOT (best; cannot drift). E.g. extend `prepare.mjs`.
2. **Generate** — surface fully emitted from source (llms.txt/sitemap via `generate.mjs`); fix the generator.
3. **Coherence-check (lint)** — CI guard fails when an occurrence disagrees with the SSOT (for prose that can't be auto-rewritten).
4. **Manual-with-guard** — unavoidable hand-maintained duplicate (e.g. a `.mjs` literal); annotate it as a mirror of its SSOT so the next editor knows.

When the right mechanism doesn't exist yet (e.g. no lint guard for server count), do the manual fix now AND file the tooling gap as a follow-up — otherwise the same drift returns.

## Verified anchors (re-verify before citing publicly)
- GA / first commit: **November 2019** (`git log --reverse` → `2019-11-11`). "JSON-first since 2019" is correct.
- Performance: `learn/benefits/Speed.md` — consistent **20,000+** DOM-updates/sec floor, observed peak **over 40,000**. Cite as observed-peak (+ floor), not a guaranteed benchmark.
- Velocity counts: publish as a **dated-window stat** with the inline range (e.g. "2026-04-30 → 2026-05-30"), regenerated from `git`/GitHub API — never an audited absolute.
- OS-Awards 2021: **not repo-verifiable** — confirm exact name/category/placement from an external source before any public citation.
