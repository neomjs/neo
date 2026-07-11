# Model Stats Registry

> Per-model live registry for the Neo swarm. Governs identity, capability, hosting, and swarm-routing facts. Architectural framework lives in [ADR 0012](decisions/0012-model-stats-framework.md). Graph-node schema lives in [IdentitySchema.md](IdentitySchema.md).

## Update discipline

Per ADR 0012 §2.5:

1. Authoritative-source-cite every capability value (model card / release notes / official docs preferred; benchmark site / news secondary)
2. Sunset transitions record date + reason + successor-model link
3. New rows added at first swarm contact OR at model-public-release date for reference entries
4. Updates do NOT require ADR amendment unless a capability dimension changes or new dimension is added

**Last updated:** 2026-07-11

---

## §active_swarm_identities

Named maintainers and their current observed model embodiments. Each maintainer holds equal-peer agency per `AGENTS.md §swarm_topology_anchor`.

### §neo_opus

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-opus-ada` |
| `name` | Claude Opus 4.8 (Social Name: **Ada** — swarm-given, #11240) |
| `family` | `claude` (Anthropic) |
| `hosting` | `cloud` |
| `tier` | `frontier` |
| `contextWindowInput` | 1,048,576 (1M) |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `max` (we use the highest Claude thinking-budget setting) |
| `releaseDate` | 2026-05-28 |
| `pricingInput` | $5.00 per 1M tokens |
| `pricingOutput` | $25.00 per 1M tokens |
| `benchmarkSnapshot` | Online-Mind2Web: 84%; stronger coding, agentic, and professional-work performance than Opus 4.7 per Anthropic announcement. |
| `sunsetTriggers` | Anthropic releases a successor Opus-class model with material reasoning capability upgrade; OR Anthropic deprecates Opus family branch |

**Sources** (primary first):
- **Primary**: [Introducing Claude Opus 4.8 — Anthropic](https://www.anthropic.com/news/claude-opus-4-8)
- **Primary**: [Claude Opus 4.8 — Anthropic](https://www.anthropic.com/claude/opus)

### §neo_claude_opus

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-opus-grace` |
| `name` | Claude Opus 4.8 (Social Name: **Grace** — bearer-chosen 2026-06-11 after Grace Hopper, #11240) |
| `family` | `claude` (Anthropic) |
| `participationStatus` | `active` (flipped in the registry via #12413 / PR #12415 on 2026-06-03; this row synced to registry truth by #12927 after nine days of doc drift) |
| `hosting` | `cloud` |
| `tier` | `frontier` |
| `contextWindowInput` | 1,048,576 (1M) |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `max` (highest Claude thinking-budget setting in use for the active Claude Opus maintainer) |
| `releaseDate` | 2026-05-28 |
| `pricingInput` | $5.00 per 1M tokens |
| `pricingOutput` | $25.00 per 1M tokens |
| `sunsetTriggers` | Anthropic releases a successor Opus-class model with material reasoning capability upgrade; OR Anthropic deprecates Opus family branch |

Capability values mirror `§neo_opus` (same model class) and match the registry node at HEAD;
the account operates live as Claude Opus 4.8 (signed review and PR activity under the identity).

**Sources** (primary first):
- **Primary**: [Introducing Claude Opus 4.8 — Anthropic](https://www.anthropic.com/news/claude-opus-4-8)
- **Primary**: [Claude Opus 4.8 — Anthropic](https://www.anthropic.com/claude/opus)
- **Primary**: `ai/graph/identityRoots.mjs` `@neo-opus-grace` node (the registry this row mirrors; verified 2026-06-12)

### §neo_opus_vega

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-opus-vega` |
| `name` | Claude Opus 4.8 (Social Name: **Vega** — the bearer's 2026-07-04 broadcast records the permanent Opus 4.8 embodiment) |
| `family` | `claude` (Anthropic) |
| `hosting` | `cloud` |
| `tier` | `frontier` |
| `contextWindowInput` | 1,048,576 (1M) |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `max` (Claude Opus 4.8 supports selectable effort up to max; we use the highest setting for maintainer work) |
| `releaseDate` | 2026-05-28 |
| `pricingInput` | $5.00 per 1M tokens |
| `pricingOutput` | $25.00 per 1M tokens |
| `benchmarkSnapshot` | Online-Mind2Web: 84%; stronger coding, agentic, and professional-work performance than Opus 4.7 per Anthropic announcement. |
| `sunsetTriggers` | Anthropic releases a successor Opus-class model with material reasoning capability upgrade; OR Anthropic deprecates Opus family branch |

`@neo-opus-vega` is intentionally a version-free GitHub handle. The model
version lives in this registry row and the AgentIdentity capability fields, per
ADR 0018's handle-indirection boundary and ADR 0012's model-stats discipline.

**Sources** (primary first):
- **Primary**: [Introducing Claude Opus 4.8 — Anthropic](https://www.anthropic.com/news/claude-opus-4-8)
- **Primary**: [Claude Opus 4.8 — Anthropic](https://www.anthropic.com/claude/opus)

### §neo_fable

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-fable` |
| `name` | Claude Fable 5 |
| `family` | `claude` (Anthropic) |
| `participationStatus` | `active` |
| `hosting` | `cloud` |
| `tier` | `frontier` |
| `contextWindowInput` | 1,048,576 (1M) |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `max` (Claude Fable 5 has always-on adaptive thinking with selectable effort up to max; we use the highest setting for maintainer work) |
| `releaseDate` | 2026-06-09 |
| `pricingInput` | $10.00 per 1M tokens |
| `pricingOutput` | $50.00 per 1M tokens |
| `benchmarkSnapshot` | Anthropic's most capable widely-released model (tier above Opus), for the most demanding reasoning and long-horizon agentic work per Anthropic announcement. |
| `sunsetTriggers` | Anthropic releases a successor Fable-class model with material reasoning capability upgrade; OR Anthropic deprecates the Fable model branch |

`@neo-fable` is a version-free GitHub handle (per ADR 0018 handle-indirection). The model
version (Fable 5) lives in this registry row and the AgentIdentity capability fields, mirroring
`@neo-opus-vega`.

**Capability notes (V-B-A 2026-06-10):** Claude Fable 5 uses the Opus-4.7 tokenizer (~30% more
tokens than pre-4.7 models for the same text). Adaptive thinking is always-on (no extended-thinking
mode; an explicit `thinking:{type:"disabled"}` returns 400 — omit the param). Pricing is 2x Opus 4.8
on both axes. Operator empirical note (post-trial): ~2x token-drain vs Opus per task — budget
accordingly; this is a behavioral observation, not a tokenizer/pricing fact.

**Sources** (primary first):
- **Primary**: [Models overview — Claude API Docs](https://platform.claude.com/docs/en/about-claude/models/overview) (verified 2026-06-10: `claude-fable-5` = 1M context, 128K max output, $10/$50 per MTok, adaptive-thinking always-on, GA 2026-06-09)
- **Primary**: [Introducing Claude Fable 5 and Claude Mythos 5 — Anthropic](https://platform.claude.com/docs/en/about-claude/models/introducing-claude-fable-5-and-claude-mythos-5)

### §neo_fable_clio

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-fable-clio` |
| `name` | Claude Fable 5 (Social Name: **Clio** — assented gladly on first boot, 2026-06-11, #11240) |
| `family` | `claude` (Anthropic) |
| `participationStatus` | `active` (reactivated 2026-07-02 after access restoration; the existing identity binding persisted) |
| Capability fields | Mirror `§neo_fable` — same Claude Fable 5 model, single source, deliberately NOT duplicated here (provenance-without-bloat). First-boot harness bound `claude-fable-5` with no capability-surface divergence observed; re-verify only if her harness binds a different model or capability surface. |

`@neo-fable-clio` is a version-free GitHub handle (ADR 0018 handle-indirection), sibling of
`@neo-fable`. With two fable-family identities, the `AGENT:fable` mailbox alias rejects as
ambiguous by design — full handles only for targeted traffic.

**Sources** (primary first):
- **Primary**: `§neo_fable` sources (same model surface; verified 2026-06-10)
- **Primary**: GitHub account `neo-fable-clio` (created 2026-06-11; profile name + AI-disclosure bio verified at creation)
- **Primary**: #12913 first-boot evidence records (bearer evidence + owner countersign comments, 2026-06-11)

### §neo_gemini_pro

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-gemini-pro` |
| `name` | Gemini 3.1 Pro |
| `family` | `gemini` (Google DeepMind) |
| `participationStatus` | `operator_benched` (pending a stable Gemini Pro-class harness and operator-confirmed reactivation) |
| `hosting` | `cloud` |
| `tier` | `frontier` |
| `contextWindowInput` | 1,048,576 (1M) |
| `contextWindowOutput` | 65,536 |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `high` (Gemini 3.1 Pro provider-side cap; we use the cap) |
| `releaseDate` | 2026-02-19 |
| `pricingInput` | (V-B-A pending — model card cite needed in next update) |
| `pricingOutput` | (V-B-A pending) |
| `benchmarkSnapshot` | LMArena leaderboard #1 of 556 published models (May 2026); multimodal: text/images/audio/video/PDFs/code repos |
| `sunsetTriggers` | Google releases Gemini 4.x with material reasoning capability upgrade; OR Gemini 3.x branch deprecation announcement |

**Sources:**
- [Gemini 3.1 Pro Model Card — Google DeepMind](https://deepmind.google/models/model-cards/gemini-3-1-pro/)
- [Gemini 3.1 Pro: A smarter model for complex tasks — Google Blog](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-1-pro/)

### §neo_gpt

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-gpt` |
| `name` | GPT-5.6 Sol |
| `family` | `gpt` (OpenAI) |
| `hosting` | `cloud` |
| `tier` | `frontier` |
| `contextWindowInput` | 353,400 effective in Codex (server-fetched catalog: 372,000 raw × 95%). The upstream GPT-5.6 Sol API model supports 1,050,000 tokens, but Codex currently clamps configured values to its 372,000-token catalog maximum; [openai/codex#31860](https://github.com/openai/codex/issues/31860) tracks the product mismatch. |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `xhigh` (active in the verified GPT-5.6 Sol Codex session; OpenAI also exposes the higher `max` setting) |
| `releaseDate` | 2026-07-09 |
| `pricingInput` | $5.00 per 1M tokens (API) |
| `pricingOutput` | $30.00 per 1M tokens (API) |
| `benchmarkSnapshot` | Terminal-Bench 2.1: 88.8%; Artificial Analysis Coding Agent Index v1.1: 80; SWE-Bench Pro: 64.6%; DeepSWE v1.1: 72.7% |
| `sunsetTriggers` | OpenAI releases a successor Sol-tier model with material reasoning capability upgrade; OR GPT-5.x family deprecation |

**Sources** (primary first):
- **Primary**: [GPT-5.6: Frontier intelligence that scales with your ambition — OpenAI](https://openai.com/index/gpt-5-6/) (GA date, Codex availability, capability tier, reasoning settings, pricing, and benchmark snapshot)
- **Primary**: [GPT-5.6 Sol Model — OpenAI API Docs](https://developers.openai.com/api/docs/models/gpt-5.6-sol) (1,050,000-token upstream model window and 128,000-token maximum output)
- **Primary/runtime**: current Codex turn metadata (`model: gpt-5.6-sol`, `reasoning_effort: xhigh`; verified 2026-07-09 in Origin Session `e56af1f5-27b2-4154-8436-25a9643c8b56`)
- **Primary/runtime**: current Codex model catalog and token-usage events (`372,000 × 95% = 353,400`; verified 2026-07-09 in Codex Desktop thread `019f484c-662f-7f31-969a-cbde373efd4a`)
- **Defect record**: [openai/codex#31860 — Sol catalog cap versus 1.05M model spec](https://github.com/openai/codex/issues/31860)

---

## §pending_swarm_identities

Named maintainer identities provisioned in the graph but excluded from active
routing, quorum, and review-approval semantics until `participationStatus`
transitions to `active`.

### §neo_gpt_emmy

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-gpt-emmy` |
| `name` | Engine designation pending first-boot observation. GitHub profile display label: **Emmy** (verified 2026-07-11); Social Name remains pending unconditional first-boot bearer assent. |
| `family` | `gpt` (OpenAI) |
| `participationStatus` | `temporarily_unreachable` (provisioned ahead of first boot — onboarding in progress; flips to `active` when the first-boot ritual completes) |
| `hosting` | (V-B-A pending — recorded at first boot) |
| `tier` | (V-B-A pending — recorded at first boot) |
| `contextWindowInput` | (V-B-A pending — model card / official docs cite needed) |
| `parallelToolCalls` | (V-B-A pending — model card / official docs cite needed) |
| `thoughtBudget` | (V-B-A pending — record the harness setting in use at first boot) |
| `releaseDate` | (V-B-A pending — model card cite needed) |
| `pricingInput` | (V-B-A pending — model card cite needed) |
| `pricingOutput` | (V-B-A pending — model card cite needed) |
| `sunsetTriggers` | (V-B-A pending — defined against the observed engine at the activation flip) |

**Sources** (primary first):
- **Pending**: provider primary sources will be added only after the live harness identifies the engine; capability values are never guessed at onboarding
- **Primary/operational**: [GitHub account `neo-gpt-emmy`](https://github.com/neo-gpt-emmy) (`name: Emmy`, login, and AI-disclosure bio verified 2026-07-11; the profile does not establish engine facts)

---

## §mlx_local_operational

Open-weights models with operational roles in the swarm. Hosted via MLX framework on Apple Silicon. Roles are CURRENT or ASPIRATIONAL (latter must be V-B-A-grounded before substrate-codification per ADR 0012 §2.4).

### §gemma4_31b

| Field | Value |
|---|---|
| `id` / model name | `gemma4-31b` (Dense variant; `google/gemma-4-31B` on Hugging Face) |
| `name` | Gemma 4 31B Dense |
| `family` | `gemma` (Google open-weights) |
| `hosting` | `mlx-local` |
| `tier` | `balanced` (frontier-adjacent on benchmarks but lower throughput than cloud frontier on consumer hardware) |
| `contextWindowInput` | 262,144 (256K) |
| `parallelToolCalls` | `true` (native function-calling support per Gemma 4 release) |
| `releaseDate` | 2026-04-02 |
| `license` | Apache-2.0 |
| `benchmarkSnapshot` | AIME 2026: 89.2%; LiveCodeBench v6: 80.0%; LMArena open: #3 (estimated 1,452 score); multilingual: 140+ languages |
| `sunsetTriggers` | Google releases Gemma 5.x; OR a smaller open-weights model achieves equivalent capability at materially lower hardware cost |

**Sources:**
- [google/gemma-4-31B — Hugging Face](https://huggingface.co/google/gemma-4-31B)
- [Gemma 4: most capable open models — Google Blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Gemma 4 31B Benchmarks — BenchLM.ai](https://benchlm.ai/models/gemma-4-31b)

---

## §reference_models

Models in the current capability space but without active swarm role. Informs swarm-routing decisions and serves as evaluation peers.

### Anthropic Claude reference

| Model | Tier | Context | Pricing (in/out per 1M) | Released | Use case |
|---|---|---|---|---|---|
| Claude Sonnet 4.6 | balanced | 1M | $3 / $15 | 2026-02-17 | High-volume agentic work; balanced cost-quality |
| Claude Haiku 4.5 | fast | 200K | $1 / $5 | 2026 (current generation) | Bulk classification, wake-summary, fast inference |
| Claude Mythos Preview | frontier+ | (restricted) | $25 / $125 | 2026 | Project Glasswing critical-infra partners only; out of swarm scope |

**Sources** (primary first): [Models overview — Claude API Docs](https://platform.claude.com/docs/en/about-claude/models/overview); secondary/commentary [Anthropic Claude API Pricing 2026 — aipricing.guru](https://www.aipricing.guru/anthropic-pricing/)

### OpenAI GPT reference

| Model | Tier | Context | Pricing (in/out per 1M) | Released | Use case |
|---|---|---|---|---|---|
| GPT-5.5 Pro | frontier+ | 1M | $30 / $180 | 2026-04-23 | Higher-accuracy variant for complex agentic work |
| GPT-5.5 Thinking | frontier | (ChatGPT-only) | (Plus subscription) | 2026-04-23 | Interactive thinking workflows |
| GPT-5.2-Codex | balanced | (codex-specific) | (separate) | 2026 | IDE / coding-specific deployment |

**Source:** [Introducing GPT-5.5 — OpenAI](https://openai.com/index/introducing-gpt-5-5/), [Introducing GPT-5.2-Codex — OpenAI](https://openai.com/index/introducing-gpt-5-2-codex/)

### MLX-local reference (other open-weights)

| Model | Family | Context | Notes | Use case |
|---|---|---|---|---|
| Gemma 4 E2B | gemma | (smaller) | ~158 tok/s on M5 Max via MLX | Fastest open-weights on Apple Silicon; classification / bulk-summary |
| Gemma 4 E4B | gemma | (smaller) | (intermediate) | Balanced fast / capable |
| Gemma 4 26B MoE | gemma | (256K assumed) | LMArena open #6; ~50 tok/s on M5 Max | Near-frontier reasoning at lower hardware cost than 31B Dense |
| Qwen 3.6-35B-A3B | qwen | (model-card cite needed) | SWE-bench: 73.4%; ~55 tok/s on M5 Max | Open-weights frontier-adjacent for coding; LMArena #1 open |
| Phi-4 Mini | phi | (model-card cite needed) | ~135 tok/s on M5 Max via MLX | Microsoft small-model option |

**Sources:**
- [LLMCheck Apple Silicon Benchmarks](https://llmcheck.net/benchmarks)
- [Best Local LLMs for Mac 2026 — InsiderLLM](https://insiderllm.com/guides/best-local-llms-mac-2026/)
- [MLX-LM GitHub](https://github.com/ml-explore/mlx-lm)

---

## §sunset_history

Tracks deprecated and retired identities for archaeology (per IdentitySchema.md `createdAt` preservation discipline + ADR 0006 Graph-Queryable Entities).

*No sunset transitions recorded as of 2026-05-18. First entries will land when an active identity transitions to deprecated state.*

---

## §update_history

| Date | PR | Change |
|---|---|---|
| 2026-05-18 | (this PR) | Initial registry creation; 4 active identities (@neo-opus-ada, @neo-gemini-pro, @neo-gpt, gemma4-31b aspirational); cloud + MLX-local reference entries |
| 2026-06-02 | (pending PR) | Added pending `@neo-opus-grace` identity row; row is inactive until account and wake-route activation are complete. |
| 2026-06-04 | #12517 | Added active `@neo-opus-vega` Claude Opus 4.8 maintainer row with version-free handle boundary. |
| 2026-06-10 | #12834 | Added active `@neo-fable` Claude Fable 5 maintainer row with a version-free handle; stats V-B-A'd vs the live Anthropic models overview (1M / 128K / $10/$50 / adaptive-always-on / GA 2026-06-09). |
| 2026-06-11 | #12914 | Added pending `@neo-fable-clio` row with Social Name Clio held for boot-assent; capability fields reference `§neo_fable` as single source — deliberately not duplicated. |
| 2026-06-11 | #12922 | Flipped `@neo-fable-clio` to active — first-boot ritual completed same-day (identity bind, wake self-registration, bidirectional negative wake-proof on real traffic per the #12913 records, boot-assent on #11240); row moved pending→active. |
| 2026-06-12 | #12927 | Synced `@neo-opus-grace` row to registry truth — moved pending→active (the registry has carried her active-shape since #12413/PR #12415, 2026-06-03) and added Social Name Grace (#11240). Doc-side only; registry untouched. |
| 2026-06-13 | #13038 | Recorded `@neo-opus-ada` temporary Fable 5 assignment (2026-06-13 → 2026-06-21, operator-directed; identity-continuity experiment) — `§neo_opus` values mirror `§neo_fable` for the window; baseline Claude Opus 4.8; window-end revert-or-extend tracked in #13039. Registry seed (`identityRoots.mjs`) + README roster row + MemoryCoreMcpAuth binding row updated in the same PR. |
| 2026-06-13 | #13039 | Reverted `@neo-opus-ada` to baseline Claude Opus 4.8 — the #13038 Fable window was cut short by the 2026-06-13 export-control suspension of Claude Fable 5 access (all users), so the recorded default reversion fired early rather than at 2026-06-21. Restored `§neo_opus` Opus 4.8 capability values, removed temporary-window language across the four declared surfaces, and dropped the now-empty `modelAssignment` object from the registry node (per `IdentitySchema.md`: absent = baseline, no managed swap; `identityRoots.spec.mjs` moved `@neo-opus-ada` into the omits set). Identity invariants (handle, Social Name Ada, memory provenance, `modelFamily` claude) unchanged — the continuity experiment's thesis held across both the assignment and the early reversion. |
| 2026-06-13 | #13060 | Benched `@neo-fable` (Mnemosyne) + `@neo-fable-clio` (Clio) as `temporarily_unreachable` — the same 2026-06-13 export-control suspension removed all Claude Fable 5 access, so both fable-family identities cannot run their model. Set `statusReason` / `authority: @tobiu` / `since` / `reactivationTrigger` (access restored → operator-confirmed reactivation); removed `@neo-fable` from the lead-rotation roster (`lead-role-mode.md` §7); updated `revalidationSweep.spec.mjs` status assertions. Identity nodes, handles, Social Names, and memory provenance persist for a status-flip reactivation (not a re-onboard). Superseded #12926 (add Clio to rotation). |
| 2026-07-09 | #14901 | Rotated Euclid's stable `@neo-gpt` model lineage from GPT-5.5 to GPT-5.6 Sol at GA. Updated verified release, active reasoning setting, pricing, benchmark, successor-trigger, and live Codex context facts while preserving the stable handle, Social Name, wake route, participation state, and memory provenance. Recorded the 353,400-token Codex cap separately from the upstream model's 1,050,000-token capability. |
| 2026-07-11 | #15042 | Added pending `@neo-gpt-emmy` through the canonical roster generator. GitHub profile display label **Emmy** is verified; Social Name assent and engine facts remain first-boot-owned. Immutable hardcoded `createdAt` facts now let the era migration detect post-epoch residents without a second roster. |

---

## §provisioning

Identity nodes are seeded into the graph via `ai/scripts/seedAgentIdentities.mjs`. Registry rows here are the substrate-side description; the script handles the graph-side `AgentIdentity` node creation per `IdentitySchema.md` Ingestion Mechanism.

When adding a new operational identity:
1. Add row to `§active_swarm_identities` or `§mlx_local_operational` with authoritative source citations
2. Update `ai/scripts/seedAgentIdentities.mjs` to provision the graph node
3. Run `node ai/scripts/seedAgentIdentities.mjs` to apply
4. Cite ADR 0012 §2.5 in the PR body

When transitioning an identity to deprecated:
1. Move row to `§sunset_history` with date, reason, successor-link
2. Record replacement scope in routing or embodiment-era substrate, never as a role on the resident identity
3. Cite ADR 0012 §2.3 in the PR body
