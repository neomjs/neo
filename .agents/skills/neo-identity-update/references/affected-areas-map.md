# Affected-Areas Map — every surface that encodes Neo identity

Organized by **update mechanism** (each class has a distinct edit point + failure mode). Mapped via an 11-agent fan-out audit, 2026-05-30 (Memory Core session `94a91ebc-d325-4d32-a746-4ff8c26c0342`). Line refs drift — re-verify before editing.

## Class 1 — hand-edited prose
Markdown a human edits directly. Failure mode: generations drift apart (one doc says "framework", another "organism").

| Surface | What identity it encodes |
|---|---|
| `README.md` | Should LEAD with the canonical apex (self-evolving software organism — Body `/src/` + Brain `/ai/` the two hemispheres beneath it; ADR 0018 §2.7 OD-1); "Who This Is For"; Platform-at-Scale metrics; maintainer roster. (Currently still leads with digital-organism / Four Pillars — a drift the skill's first run corrects.) |
| `.github/VISION.md` | Long-form vision; **known fossil-prone** (carried "web applications" + CEO/PM/Drone hierarchy contradicting Flat Peer-Team) |
| `ROADMAP.md` | Forward positioning; "Corporate HQ" framing; skill/velocity counts |
| `CONTRIBUTING.md`, `.github/GETTING_STARTED.md`, `.github/AI_QUICK_START.md` | Contributor-facing identity; MCP-server count; Node requirement |
| `.github/STORY.md` | **Public-era heritage SSOT**: origin narrative, 2015 worker POC, public GitHub start, JSON-first VDOM, worker-first architecture, multi-window line. |
| `.github/NEOMJS_HISTORY.md` | Pre-public contributor credits / acknowledgements archive. Do **not** extend it with public-era milestones unless an explicit operator ruling changes its document kind. |
| `learn/benefits/**` | Engineering-altitude identity (ArchitectureOverview "Two Hemispheres", Introduction, comparisons/NeoVs*); the **RIGHT-hemisphere AI-team doc lives here** |
| `learn/agentos/*.md` | Mechanism-altitude (DreamPipeline, MX, MemoryCore, NeuralLink); the recurring motto |
| `.claude/CLAUDE.md` (§neo_identity_anchor, §swarm_topology_anchor), `learn/agentos/AGENTS_ATLAS.md` | Agent-facing identity anchors; maintainer roster; pillar definitions |

## Class 2 — generated-output-source (THE TRAP)
A build script emits the surface. **Edit the generator, never the output.**

| Generator (edit here) | Emits | Identity encoded |
|---|---|---|
| `buildScripts/docs/seo/generate.mjs` (`getLlmsTxt`, ~L539-559 header; `PRIORITIES` map ~L28-110) | `apps/portal/llms.txt`, `apps/portal/sitemap.xml` | llms.txt identity header (LLM-crawler facing); route-priority = implicit positioning |

## Class 3 — structured-facts-in-code (THE ROT ZONE)
JSON/JS data fields. Failure mode: version/count facts rot independently.

| Surface | What identity it encodes |
|---|---|
| `package.json` (`description`, `keywords[]`, `version`, `engines`) | npm-facing tagline + discovery keywords + the version FACT + (to add) Node floor |
| `apps/portal/index.html` (3× `application/ld+json`, `<meta name=description>`, `<title>`, FAQ) | schema.org identity; **rot hotspot** — version, softwareRequirements, MCP-server count all stale-prone here |
| `apps/portal/view/home/parts/*.mjs` (`hero/Content.mjs` cycleTexts + h3, `AiToolchain.mjs`, `Features.mjs`, `FooterContainer.mjs` version literal) | Website home identity copy; cycling taglines; feature claims |

## Class 4 — external-platform (NOT in git; needs API)
Changed via gh/web, invisible to grep.

| Surface | How to read/edit | Identity encoded |
|---|---|---|
| GitHub repo description + topics | `gh repo view neomjs/neo --json description,repositoryTopics`; `gh repo edit` | Repo-page tagline + discovery topics (should mirror package.json) |
| npm registry page | derives from `package.json` on publish | npm tagline + keywords |
| Discord / Slack / LinkedIn / Sponsors | external dashboards | Community/author identity |

## Class 5 — dated-snapshot (calendar-stale)
Correct as-of a date; ages silently. Refresh in lock-step.

| Surface | Lock-step sibling |
|---|---|
| `README.md` "A Platform at Scale (State of <date>)" | `learn/guides/fundamentals/CodebaseOverview.md` (canonical numbers) |
| `ROADMAP.md` velocity metrics; `learn/agentos/ModelStats.md` | their own as-of dates |

## Coverage notes
- Heritage facts live in `.github/STORY.md`; README + portal About Us reference that home without duplicating milestone lists. OS-Awards claims need an acceptable external public source before publication.
- Identity handles are routed through `ai/graph/identityRoots.mjs`; handle de-versioning is operator-owned (account rename), the skill only propagates. Model-version stays in `ModelStats.md` per ADR 0012. Re-run a seam-keyed grep before claiming total coverage.
- Not yet fully swept: `apps/portal/view/about` (`/about-us`), live neomjs.com `<meta>`/ld+json, `learn/comparisons/*`. Re-run a fan-out before claiming total coverage.
