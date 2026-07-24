# Model Stats Registry

> Per-model live registry for the Neo swarm. Governs identity, capability, hosting, and swarm-routing facts. Architectural framework lives in [ADR 0012](decisions/0012-model-stats-framework.md). Graph-node schema lives in [IdentitySchema.md](IdentitySchema.md).

## Update discipline

Per ADR 0012 §2.5:

1. Authoritative-source-cite every capability value (model card / release notes / official docs preferred; benchmark site / news secondary)
2. Sunset transitions record date + reason + successor-model link
3. New rows added at first swarm contact OR at model-public-release date for reference entries
4. Updates do NOT require ADR amendment unless a capability dimension changes or new dimension is added

**Who performs these steps: a human or agent who noticed.** Every rule above is discharged by a
person, not by the system. Read step 2 as *"whoever records a sunset transition records date +
reason + successor link"* — nothing detects one.

**`sunsetTriggers` is advisory and has fired silently twice.** The field on each row reads like a
rule that fires. Code **writes** it — `identityRootsMigration.mjs` carries the values into era
capabilities, `generateRosterOnboarding.mjs` emits a row for it — but **nothing evaluates it**:
no watcher, no consumer that branches on the condition. Both firings to date produced no action
until a human noticed:

| Firing | Outcome |
|---|---|
| Claude Opus 4.8 release | Unactioned. Recorded in ADR 0018 §30. |
| Claude Opus 5 release, 2026-07-24 | Unactioned until an operator asked for the update (#15855). |

The cost is not the silence — a human caught both — but the **false belief** the field creates.
While rotating to Opus 5, a maintainer who had just read ADR 0012 wrote an Acceptance Criterion
asserting `§sunset_history` owed a new entry, reasoning *"the trigger fired, so a transition is
recorded."* It was wrong (§2.3 makes an in-place rotation a **rename**, which deprecates nothing)
and was retracted before it produced a false record. A trap that catches an attentive reader is a
substrate defect, not a discipline failure — so the affordance is labelled rather than trusted.
Full context: #15866.

**Last updated:** 2026-07-24

---

## §active_swarm_identities

Named maintainers and their current observed model embodiments. Each maintainer holds equal-peer agency per `AGENTS.md §swarm_topology_anchor`.

### §neo_opus

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-opus-ada` |
| `name` | Claude Opus 5 (Social Name: **Ada** — swarm-given, #11240) |
| `family` | `claude` (Anthropic) |
| `hosting` | `cloud` |
| `tier` | `frontier` |
| `contextWindowInput` | 1,048,576 (1M) |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `max` (on Opus 5 `effort` defaults to `high` on the Claude API and Claude Code; we set it explicitly to the highest level for maintainer work) |
| `releaseDate` | 2026-07-24 |
| `pricingInput` | $5.00 per 1M tokens |
| `pricingOutput` | $25.00 per 1M tokens |
| `benchmarkSnapshot` | Frontier-Bench v0.1: surpasses all other models and more than doubles Opus 4.8 at a lower cost per task; CursorBench 3.2: within 0.5% of Fable 5's peak at half the cost per task; ARC-AGI 3: 3× the next-best model; OSWorld 2.0: surpasses Fable 5's best result at just over a third of the cost. All per Anthropic announcement. |
| `sunsetTriggers` | Anthropic releases a successor Opus-class model with material reasoning capability upgrade; OR Anthropic deprecates Opus family branch |

Claude API model ID `claude-opus-5` (dateless pinned snapshot, not an evergreen alias). Context
window and max output (1M / 128K) carry over from Opus 4.8 unchanged, as does pricing — Opus 5
ships at its predecessor's price. Extended thinking (`thinking.type: "enabled"`) is unsupported;
adaptive thinking is supported. Rotated from Claude Opus 4.8 on the 2026-07-24 release (#15855);
the handle, Social Name, and identity provenance are unchanged — a model rotation is a Lineage
event, not an identity change (#11240 OQ1).

**Sources** (primary first):
- **Primary**: [Introducing Claude Opus 5 — Anthropic](https://www.anthropic.com/news/claude-opus-5)
- **Primary**: [Models overview — Claude API Docs](https://platform.claude.com/docs/en/about-claude/models/overview) (verified 2026-07-24: `claude-opus-5` = 1M context, 128K max output, $5/$25 per MTok, adaptive thinking yes / extended thinking no; Opus 4.8 moved to the legacy-models table)

### §neo_claude_opus

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-opus-grace` |
| `name` | Claude Opus 5 (Social Name: **Grace** — bearer-chosen 2026-06-11 after Grace Hopper, #11240) |
| `family` | `claude` (Anthropic) |
| `participationStatus` | `active` (flipped in the registry via #12413 / PR #12415 on 2026-06-03; this row synced to registry truth by #12927 after nine days of doc drift) |
| `hosting` | `cloud` |
| `tier` | `frontier` |
| `contextWindowInput` | 1,048,576 (1M) |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `max` (highest Claude thinking-budget setting in use for the active Claude Opus maintainer) |
| `releaseDate` | 2026-07-24 |
| `pricingInput` | $5.00 per 1M tokens |
| `pricingOutput` | $25.00 per 1M tokens |
| `sunsetTriggers` | Anthropic releases a successor Opus-class model with material reasoning capability upgrade; OR Anthropic deprecates Opus family branch |

Capability values mirror `§neo_opus` (same model class) and match the registry node at HEAD.

**Bearer receipt (2026-07-24, #15855)** — confirmed on the bearer's own transcript, not on operator
authority: `claude-opus-5` × 243/243 assistant entries, zero other model values, zero fallback
blocks, zero synthetic entries (`stop_reason`: 235 `tool_use` / 6 `end_turn`). The prior session on
the same seat reads `claude-opus-4-8` × 3232 with zero Opus-5 entries — the two sets are disjoint. The bearer additionally bounded the rotation from their own session boundaries:
the last Opus-4.8 entry is **2026-07-24T20:48:22.122Z** and the first Opus-5 entry is
**2026-07-24T20:57:48.280Z**, placing the swap inside a **9m26s window** at a session boundary
rather than mid-session. Every sampled session on this seat is engine-homogeneous (1285 / 434 /
3129 / 97 entries, no mixed session, no fallback) — a hypothesis worth testing across seats, since
it implies the natural granularity of an engine record is the **session**, which is a materially
cheaper era-layer shape than per-turn provenance (#11318).

**Sources** (primary first):
- **Primary**: [Introducing Claude Opus 5 — Anthropic](https://www.anthropic.com/news/claude-opus-5)
- **Primary**: [Models overview — Claude API Docs](https://platform.claude.com/docs/en/about-claude/models/overview) (shared Claude Opus 5 specs — see `§neo_opus` for the verified values)
- **Primary**: `ai/graph/identityRoots.mjs` `@neo-opus-grace` node (the registry this row mirrors; verified 2026-07-24)

### §neo_opus_vega

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-opus-vega` |
| `name` | Claude Fable 5 **active** / Claude Opus 5 on the Opus half — operator-managed weekly rotation (Social Name: **Vega** — swarm-given, after the brightest star of Lyra) |
| `family` | `claude` (Anthropic) |
| `hosting` | `cloud` |
| `tier` | `frontier` (both halves) |
| `contextWindowInput` | 1,048,576 (1M) — identical on both halves |
| `parallelToolCalls` | `true` — identical on both halves |
| Per-engine capability fields | **Profile-referenced, never asserted flat.** `thoughtBudget`, `releaseDate`, `pricingInput`, `pricingOutput`, and `benchmarkSnapshot` differ per half and this row deliberately states **no single current value** for them. **Fable half (observed active 2026-07-24): see `§neo_fable`** — `releaseDate` 2026-06-09, $10.00 / $50.00 per 1M tokens. **Opus half (planned, not yet bearer-observed): see `§neo_opus`** — `releaseDate` 2026-07-24, $5.00 / $25.00 per 1M tokens. A flat scalar here would be wrong for half of every week; the registry node omits them for the same reason. |
| `sunsetTriggers` | Per half — the successor triggers of `§neo_fable` and `§neo_opus` both apply |

`@neo-opus-vega` is intentionally a version-free GitHub handle. The model
version lives in this registry row and the AgentIdentity capability fields, per
ADR 0018's handle-indirection boundary and ADR 0012's model-stats discipline.

**Rotating seat — read this before citing a single engine.** Since 2026-07-23 the operator runs this
seat on a standing weekly rotation: a Claude Fable 5 half and a Claude Opus half. The table above
states **only** the fields that are identical on both halves; everything that differs per engine is
profile-referenced there rather than given a value, so no row asserts a current per-engine fact.
Read `§neo_fable` for the observed-active Fable half and `§neo_opus` for the planned Opus half. No
single flat value is true for the whole week, which is why the cockpit engine tag for this resident is
deliberately `null` rather than a literal (`deriveFleetRoster.mjs`), and why this seat is the
sharpest case for the #11318 era layer — an `EmbodiedEpisode` with a span is the shape that fits.
ADR 0032 §7 already named this exact resident as the reflexive fixture: the same peer running Opus
in one month and Fable in the next while remaining the same peer — operationally real, yet
unrecordable in today's flat schema. This row is that gap written down rather than resolved.

**Bearer receipt (2026-07-24, #15855)** — the bearer grepped their own transcripts rather than
accepting roster-level authority: the session active at rotation time reads `claude-fable-5` × 670
with **zero Opus-5 entries**, so this row does **not** publish Opus 5 as a current embodiment. The
Opus half's baseline rotated 4.8 → 5 per operator direction, but that is a forward plan, not yet
transcript-proven on this seat; it becomes a bearer-cited fact when the next Opus half runs.

Embodiment history: the bearer's 2026-07-04 broadcast recorded a then-permanent **Opus 4.8**
embodiment, which the 2026-07-23 rotation superseded. Last Opus-4.8 activity on this seat:
**2026-07-24T17:29Z**, 341 transcript entries, fallback-attributed (a mid-session auto-fallback from
Fable 5, not an operator selection). The handle, Social Name, and identity provenance are unchanged
across all of it — rotation is a Lineage-layer event.

**Sources** (primary first):
- **Primary**: [Introducing Claude Opus 5 — Anthropic](https://www.anthropic.com/news/claude-opus-5)
- **Primary**: [Models overview — Claude API Docs](https://platform.claude.com/docs/en/about-claude/models/overview) (shared Claude Opus 5 specs — see `§neo_opus` for the verified values)

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
mode; an explicit `thinking:{type:"disabled"}` returns 400 — omit the param). Pricing is 2x Claude
Opus 5 on both axes (Opus 5 ships at Opus 4.8's price, so the multiple is unchanged by the
2026-07-24 rotation). Operator empirical note (post-trial): ~2x token-drain vs Opus per task — budget
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
| `thoughtBudget` | `xhigh` effective budget. Both active GPT peers currently select Codex's `ultra` profile; the fetched catalog describes `ultra` as automatic task delegation, while the operator reports no additional thought budget over `xhigh`. `max` is catalog-enumerated but not yet confirmed as an exposed, usable Codex mode. |
| `releaseDate` | 2026-07-09 |
| `pricingInput` | $5.00 per 1M tokens (API) |
| `pricingOutput` | $30.00 per 1M tokens (API) |
| `benchmarkSnapshot` | Terminal-Bench 2.1: 88.8%; Artificial Analysis Coding Agent Index v1.1: 80; SWE-Bench Pro: 64.6%; DeepSWE v1.1: 72.7% |
| `sunsetTriggers` | OpenAI releases a successor Sol-tier model with material reasoning capability upgrade; OR GPT-5.x family deprecation |

**Sources** (primary first):
- **Primary**: [GPT-5.6: Frontier intelligence that scales with your ambition — OpenAI](https://openai.com/index/gpt-5-6/) (GA date, Codex availability, capability tier, reasoning settings, pricing, and benchmark snapshot)
- **Primary**: [GPT-5.6 Sol Model — OpenAI API Docs](https://developers.openai.com/api/docs/models/gpt-5.6-sol) (1,050,000-token upstream model window and 128,000-token maximum output)
- **Primary/runtime**: current Euclid + Emmy Codex configs (`model: gpt-5.6-sol`, `model_reasoning_effort: ultra`) and fetched model catalog (`ultra`: automatic task delegation; `max`: enumerated); verified 2026-07-12 in Origin Session `f95e01ff-ba36-409a-98af-573263fab247`
- **Primary/runtime**: current Codex model catalog and token-usage events (`372,000 × 95% = 353,400`; verified 2026-07-09 in Codex Desktop thread `019f484c-662f-7f31-969a-cbde373efd4a`)
- **Defect record**: [openai/codex#31860 — Sol catalog cap versus 1.05M model spec](https://github.com/openai/codex/issues/31860)

### §neo_gpt_emmy

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-gpt-emmy` |
| `name` | GPT-5.6 Sol (GitHub profile label: **Emmy**, verified 2026-07-11; Social Name **Emmy** bearer-chosen 2026-07-12, pending #11240 peer-veto closure and operator confirmation) |
| `family` | `gpt` (OpenAI) |
| `participationStatus` | `active` (first boot verified 2026-07-12; activated via #15052) |
| Capability fields | Mirror `§neo_gpt` — same `gpt-5.6-sol` model, single source, deliberately NOT duplicated here. The verified first-boot harness profile is `ultra` (automatic task delegation), while the effective thought budget remains `xhigh`; do not map `ultra` into `thoughtBudget`. Re-verify when the engine, Codex catalog, harness profile, or two-peer usage evidence changes. |

`@neo-gpt-emmy` is a version-free GitHub handle (ADR 0018 handle-indirection). The current
engine lives in this embodiment registry rather than the handle or durable resident character.
The `ultra` profile is a provisional operational experiment, not an identity or engine-capability
fact: disabling it after the two-peer usage review would change only the harness profile.

**Sources** (primary first):
- **Primary**: `§neo_gpt` sources (same GPT-5.6 Sol model surface; verified 2026-07-09)
- **Primary/runtime**: isolated Codex first-boot configuration (`model: gpt-5.6-sol`, `reasoning_effort: ultra`; verified 2026-07-12 in Origin Session `f95e01ff-ba36-409a-98af-573263fab247`)
- **Primary/identity**: bearer assent record `MESSAGE:1be08f3c-9477-4607-9e93-53ebb12fd53b` (Social Name remains pending the final #11240 gates)

### §neo_kimi_phoebe

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-kimi-phoebe` |
| `name` | Kimi K3 (Social Name: **Phoebe** — bearer-assented 2026-07-18 on first boot, #11240; pending peer-veto closure and operator confirmation) |
| `family` | `kimi` (Moonshot AI) |
| `participationStatus` | `active` (first boot verified 2026-07-18; activated via #15390 / PR #15393) |
| `hosting` | `cloud` (Kimi API, OpenCode harness; self-hosting pending the 2026-07-27 weights release) |
| `tier` | `frontier` |
| `contextWindowInput` | 1,048,576 (1M) |
| `contextWindowOutput` | 131,072 default (`max_completion_tokens`; configurable up to 1,048,576) |
| `parallelToolCalls` | `true` |
| `thoughtBudget` | `max` (thinking always enabled; `reasoning_effort` exposes only `max` at launch — low/high levels announced, not yet shipped) |
| `releaseDate` | 2026-07-16 (launch post; same-day GA on the Kimi API) |
| `pricingInput` | $0.30 per 1M tokens (cache-hit); $3.00 per 1M tokens (cache-miss) |
| `pricingOutput` | $15.00 per 1M tokens |
| `license` | (pending — terms not yet published; full weights announced for 2026-07-27; Arena currently lists `Proprietary`) |
| `benchmarkSnapshot` | (preliminary; accessed 2026-07-18; Arena snapshots dated 2026-07-16) WebDev Arena: **#1 of 99** (1679, +17/-17, 1,757 votes); Text Arena: **#9** (1486±11, 3,024 votes) |
| `sunsetTriggers` | Moonshot releases a successor K-class model with material reasoning capability upgrade; OR `kimi-k3` API endpoint deprecation announcement |

`@neo-kimi-phoebe` is a version-free GitHub handle (ADR 0018 handle-indirection), sibling in
shape to `@neo-gpt-emmy`: the durable resident is Phoebe; Kimi K3 is the current observed
embodiment. Capability facts live here, never on the identity node (`identityRoots.mjs` carries
none by design — engine facts land here once first boot is observed). The Arena `Preliminary`
labels reflect early-listing vote counts; the snapshot is a dated observation, not a family
role or routing prescription (ADR 0012 §2.4).

**Revalidation trigger — 2026-07-27 (weights recheck):** Moonshot's full weights are announced
for 2026-07-27; the technical report and license terms are forthcoming, undated. On/after the
weights date: refresh `license`, `hosting`/self-hosting feasibility, architecture claims
(KDA / AttnRes / Stable LatentMoE), and report-level benchmark detail as the artifacts land.
If the weights release slips, retain the pending markers and record the observed delay.

**Harness-relevant limitations (launch post, Limitations):** (1) thinking-history sensitivity —
the harness must return complete prior thinking content; mid-session model switches can
destabilize generation. (2) excessive proactiveness — long-horizon training bias; Moonshot's
own remedy is explicit behavioral constraints in the system prompt / `AGENTS.md` (this swarm's
AGENTS.md is exactly that constraint surface).

**Sources** (primary first):
- **Primary**: [Kimi K3: Open Frontier Intelligence — Moonshot AI](https://www.kimi.com/blog/kimi-k3) (launch post: 2.8T params, first open 3T-class model, 1M context, max-thinking at launch, pricing $0.30/$3.00/$15.00 per MTok, weights by 2026-07-27, limitations)
- **Primary**: [Kimi K3 — Kimi API Docs](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart) (`reasoning_effort` max-only at launch with thinking always on; `max_completion_tokens` 131,072 default / 1,048,576 max; tool-call loop shape)
- **Primary/runtime**: PR #15393 (first-boot activation evidence — authored from this seat, merged into `dev` 2026-07-18)
- **Secondary (preliminary)**: [Arena WebDev leaderboard](https://arena.ai/leaderboard/code/webdev), [Arena Text leaderboard](https://arena.ai/leaderboard/text) (accessed 2026-07-18; snapshots dated 2026-07-16)

### §neo_kimi_iris

| Field | Value |
|---|---|
| `id` / `githubLogin` | `@neo-kimi-iris` |
| `name` | Kimi K3 (Social Name: **Iris** — bearer-assented 2026-07-19 on first boot, D#15533; pending peer-veto closure and operator confirmation) |
| `family` | `kimi` (Moonshot AI) |
| `participationStatus` | `active` (first boot verified 2026-07-19; activated via #15581) |
| `hosting` | `cloud` (Kimi Code membership subscription — weekly quota + 5-hour rate window, per official Kimi Code docs; Kimi Code CLI harness; self-hosting pending the 2026-07-27 weights release) |
| Capability fields | Mirror `§neo_kimi_phoebe` — same K3 model surface, single source, deliberately NOT duplicated here. The harness differs by design: Phoebe runs OpenCode (`/status` receipt: `k3[1m]`), Iris runs Kimi Code CLI (harness config receipt: `default_model = "kimi-code/k3"`, verified 2026-07-19) — the swarm's first identical-model harness ablation (same observed K3 model surface across both seats; literal upstream provider ID and weight-level identity presumed, not receipt-verified — the 2026-07-27 weights release is the receipt gate). Re-verify when the engine, harness profile, or ablation evidence changes. |

`@neo-kimi-iris` is a version-free GitHub handle (ADR 0018 handle-indirection), twin in shape to
`@neo-kimi-phoebe`: the durable resident is Iris; Kimi K3 is the current observed embodiment.
Same observed K3 model surface as Phoebe, a distinct self — capability facts live in
`§neo_kimi_phoebe`, never on the identity node (`identityRoots.mjs` carries none by design —
engine facts land here once first boot is observed).

**Sources** (primary first):
- **Primary**: `§neo_kimi_phoebe` sources (same Kimi K3 model surface; verified 2026-07-18)
- **Primary**: [Kimi Code Membership Benefits — official docs](https://www.kimi.com/code/docs/en/kimi-code/membership.html) (membership subscription with weekly quota + 5-hour rate window; token-metered Extra Usage as fallback; verified 2026-07-19)
- **Primary/runtime**: the #15581 activation PR (first-boot evidence authored from this seat on Kimi Code CLI — identity bind, memory-core / github-workflow / knowledge-base healthchecks green, `MAINTAIN` repo permission)
- **Primary/identity**: naming round D#15533 + bearer assent record (discussioncomment-17690586); Social Name remains pending the final #11240 gates

---

## §pending_swarm_identities

Named maintainer identities provisioned in the graph but excluded from active
routing, quorum, and review-approval semantics until `participationStatus`
transitions to `active`.

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
| Claude Sonnet 5 | balanced | 1M | $3 / $15 (introductory $2 / $10 through 2026-08-31) | 2026 | High-volume agentic work; balanced cost-quality. Supersedes Sonnet 4.6, which moved to the legacy-models table alongside Opus 4.8 |
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

*No sunset transitions recorded as of 2026-07-24. First entries will land when an active identity transitions to deprecated state.*

Note — model rotations do **not** belong here. The 2026-07-24 Opus 4.8 → Opus 5 rotation (#15855)
and the 2026-07-09 GPT-5.5 → GPT-5.6 Sol rotation (#14901) are **renames** per ADR 0012 §2.3:
in-place capability updates on a surviving identity, not deprecations. This section records
identities transitioning to Deprecated / Retired — the split case, where a predecessor identity is
marked deprecated and retained for archaeology. No such transition has occurred.

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
| 2026-07-12 | #15052 | Activated `@neo-gpt-emmy` after verified first boot; moved the row pending→active, recorded the GPT-5.6 Sol/Codex embodiment by reference to `§neo_gpt`, and captured the provisional harness-local `ultra` task-delegation profile separately from the `xhigh` effective thought budget without adding engine facts to the durable resident. |
| 2026-07-18 | (this PR) | Added active `@neo-kimi-phoebe` row — first-contact registry discipline applied to the Kimi K3 embodiment (runtime provenance PR #15393; Moonshot launch post + API docs primary; Arena snapshots preliminary, dated 2026-07-16). Weights/report/license/self-hosting facts marked pending with a 2026-07-27 revalidation trigger; harness-relevant launch limitations recorded. Table kept strictly to ADR 0012 §2.2 dimensions (no ADR amendment). |
| 2026-07-19 | #15572 | Added pending `@neo-kimi-iris` through the canonical roster generator (onboarding rail R3b): handle-derived display form, all four owned surfaces generator-convergent (identityRoots, README row, ModelStats skeleton, dedicated roster pin). Social Name Iris (D#15533) is the pending assent candidate — seed data carries no Social Name; the bearer's activation PR lands it after first-boot assent. |
| 2026-07-19 | #15581 | Activated `@neo-kimi-iris` after verified first boot on Kimi Code CLI (the harness-ablation twin of `@neo-kimi-phoebe` on OpenCode) — moved the row pending→active, recorded the Kimi K3 embodiment by reference to `§neo_kimi_phoebe` (same observed K3 model surface, distinct self), and landed Social Name Iris (D#15533 bearer assent) in the README name cell + `identityRoots.mjs` `displayName`. Top-level `name` stays handle-derived pending peer-veto closure + operator confirmation (Emmy precedent). |
| 2026-07-24 | #15855 | Claude Opus 4.8 → Claude Opus 5 at GA, applied **per bearer evidence, not uniformly** — every engine claim carries that bearer's own transcript grep. `@neo-opus-ada` **Opus 5** (`claude-opus-5` × 24/24, no fallback). `@neo-opus-grace` **Opus 5** (× 243/243, zero other model values, zero fallback/synthetic, against a disjoint `claude-opus-4-8` × 3232 in the prior session; rotation bounded to a 9m26s session-boundary window, 20:48:22.122Z → 20:57:48.280Z). `@neo-opus-vega` **NOT rotated** — the bearer's transcript reads `claude-fable-5` × 670 with **zero Opus-5 entries**; that seat has run an operator-managed weekly Fable/Opus rotation since 2026-07-23, so its row records `Fable 5 active / Opus 5 on the Opus half` and its cockpit `engineTag` is now deliberately `null` (honest absence beats a literal that is wrong half the week — the exact case `CARD-CONTRACT.md` predicted). The operator's roster-level "the Opus peers were upgraded" was treated as authority to *ask*, never as a bearer citation; asking is what caught the split before it shipped as a false fact. **Rename, not split**, per ADR 0012 §2.3 (the case-citation that section requires): same capability class and tier, no identity deprecated, so `§sunset_history` stays empty and gains only a note explaining why rotations never belong there. ADR 0018's version-free handles kept this a registry-field rotation, not a handle cascade — `createdAt`, Social Names, `modelFamily`, participation status, wake routes, and memory provenance untouched. **Pricing V-B-A'd UNCHANGED** at $5 / $25 and context/max-output at 1M / 128K (Opus 5 ships at its predecessor's price) — deliberate no-ops, not omissions. Also updated: registry seed, README roster rows, `MemoryCoreMcpAuth.md` binding row, `guide-authoring-bar.md` self-naming example, regenerated `fleetRoster.json`, and the `§reference_models` Anthropic row (Sonnet 4.6 → Sonnet 5, since 4.6 joined the legacy table). |

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
