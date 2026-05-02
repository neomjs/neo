# PR Review Summary

**Status:** [Approved / Approve+Follow-Up / Request Changes / Drop+Supersede / Comment]

### 🪜 Strategic-Fit Decision

Per §9 Strategic-Fit Step-Back:
- **Decision**: [Approve / Approve+Follow-Up / Request Changes / Drop+Supersede]
- **Rationale**: [Why this decision shape vs the others — e.g., "Approve+Follow-Up because the substrate ships measurable value via the Antigravity path even with the cross-harness gap; cross-harness routing is better-tracked-as-follow-up ticket #NNNN than incremental cycles"]

**Peer-Review Opening:** [Friendly Opening / General encouragement. e.g., "Thanks for putting this together! Great approach to solving [Problem]. I've left some review notes below. Let's get these squared away so we can merge."]

**Self-Review Opening:** [Clinical assessment. e.g., "Self-review of #[Ticket]. This implementation chose [approach] over [alternative] because [rationale]. Key trade-offs and gaps noted below."]

*(Use exactly one opening based on the self-review detection result from the guide.)*

---

### 🕸️ Context & Graph Linking
*   **Target Epic / Issue ID:** Resolves #[Issue Number]
*   **Related Graph Nodes:** [Any other related node IDs or conceptual tags]

---

### 🔬 Depth Floor

**Challenge OR documented search (per guide §7.1):**

Provide ONE of the following:

- **Challenge**: [Weakness / unverified assumption / edge case / follow-up concern — even if non-blocking. Peer-reviews that are genuinely affirming should still name something to watch.]

OR

- **Documented search**: *"I actively looked for [specific thing 1], [specific thing 2], and [specific thing 3] and found no concerns."*

*A peer-review with neither a challenge nor a documented search fails the Depth Floor regardless of structural compliance elsewhere.*

**Rhetorical-Drift Audit (per guide §7.4):**

*(Required when the PR carries substantive architectural prose — PR description framing, Anchor & Echo JSDoc additions, `[RETROSPECTIVE]` tags, or linked-anchor citations. Mark N/A for routine code with no architectural prose.)*

Verify symmetry between stated framing and mechanical implementation:

- [ ] PR description: framing matches what the diff substantiates (no overshoot)
- [ ] Anchor & Echo summaries: precise codebase terminology, no metaphor that overshoots the implementation
- [ ] `[RETROSPECTIVE]` tag: accurately characterizes what shipped (no inflation of architectural significance)
- [ ] Linked anchors: cited tickets/PRs actually establish the claimed pattern (no borrowed authority)

**Findings:** [Pass / specific drift flagged with Required Action / N/A]

---

### 🧠 Graph Ingestion Notes

*   **`[KB_GAP]`**: [If applicable, document any framework concepts misunderstood in this PR]
*   **`[TOOLING_GAP]`**: [If applicable, document any issues with tooling, tests, or MCP execution that occurred during this PR's lifespan]
*   **`[RETROSPECTIVE]`**: [High-level architectural takeaways or praise that should be permanently remembered]

---

### 🛂 Provenance Audit

If the PR is a major architectural abstraction or new core subsystem (§7.3 threshold), document the chain of custody:
- **Internal Origin:** [session ID / internal R&D reference] OR
- **External Origin:** [ecosystem + industry-friction-radar citation]

If author cannot defend native origin vs. framework-category logic, flag as Required Action per §7.3. Mark N/A for standard features or bug fixes.

---

### 🎯 Close-Target Audit

*(Required per guide §5.2 when the PR body or commit messages contain `Closes #N` / `Resolves #N` / `Fixes #N` magic keywords. Mark N/A for PRs without close-target keywords.)*

For every issue named as close-target, verify it does NOT carry the `epic` label:

- [ ] Close-targets identified: [list of `#N` references, or "none"]
- [ ] For each `#N`: confirmed not `epic`-labeled (or flagged as Required Action below)

**Findings:** [Pass / specific epic flagged / N/A]

---

### 📡 MCP-Tool-Description Budget Audit

*(Required per guide §5.3 when the PR touches `ai/mcp/server/*/openapi.yaml` — adds a new `description:`, modifies an existing block-literal `description:`, or introduces a new tool path or operation. Mark N/A for PRs that don't touch OpenAPI surfaces.)*

For every modified or added OpenAPI tool description:

- [ ] Single-line preferred — block-literal (`|`) descriptions justified by content, not authorial habit
- [ ] No internal cross-refs (no ticket numbers, Phase sequencing, session IDs, or memory anchor names in the description payload)
- [ ] No architectural narrative — descriptions describe call-site usage (what + when-to-use + when-not-to-use)
- [ ] External standard URLs OK — citing canonical specs (e.g., `https://a2a-protocol.org/...`) is acceptable
- [ ] 1024-char hard cap respected — approaching it is a red flag (see `McpServerToolLimits` test)

**Findings:** [Pass / specific descriptions flagged / N/A]

---

### 🔌 Wire-Format Compatibility Audit

*(Required when the PR alters JSON-RPC notification schemas, payload envelopes, or native API wire formats. Mark N/A for routine changes that do not modify inter-process or inter-agent contracts.)*

- [ ] Does the change impact downstream consumers (e.g., Antigravity IDE, Bridge Daemon, Claude Code)?
- [ ] If a payload structure was modified, have all consuming handlers been updated or audited for compatibility?
- [ ] Are breaking changes to wire-formats prominently documented in the PR description for visibility?

**Findings:** [Pass / specific compatibility gaps flagged / N/A]

---

### 🔗 Cross-Skill Integration Audit

*(Required per guide §8.1 when the PR touches skill files, conventions, MCP tool surfaces, `AGENTS_STARTUP.md` / `AGENTS.md`, or architectural primitives. Mark N/A for routine code changes that don't introduce cross-substrate conventions.)*

- [ ] Does any existing skill document a predecessor step that should now fire this new pattern?
- [ ] Does `AGENTS_STARTUP.md` §9 Workflow skills list need updating?
- [ ] Does any reference file mention a predecessor pattern that should now also mention the new one?
- [ ] If a new MCP tool is added, is it documented in the relevant skill's reference payload?
- [ ] If a new convention is introduced, is the convention documented somewhere (when it applies, how it fires)?

**Findings:** [Gaps surfaced by the checklist, or "All checks pass — no integration gaps." Any gap should also appear in Required Actions below.]

---

### 🧪 Test-Execution Audit

*(Required per guide §7.5. Reviewers MUST verify RELATED tests before assigning an `[EXECUTION_QUALITY]` score.)*

- [ ] Branch checked out locally (e.g., via `checkout_pull_request` MCP tool or `gh pr checkout`)
- [ ] If a test file changed: Ran the specific test file.
- [ ] If code changed: Verified if there are tests, or if new tests are needed.

**Findings:** [Tests pass / No tests needed (docs change) / Test failures flagged in Required Actions]

---

### 📋 Required Actions

**For PRs with required actions — use the checkbox list form:**

To proceed with merging, please address the following:

- [ ] Item 1 (e.g., Add missing JSDoc to `newMethod`)
- [ ] Item 2 (e.g., Fix the race condition in `Store.js` loading)
- [ ] Item 3

**For zero-issue PRs — use the null-state sentence:**

No required actions — eligible for human merge.

*Do NOT use pre-ticked placeholder items like `- [x] All checks pass and no required changes identified.` — that reads as box-checking, not genuine review. Per guide §5 Zero-Issue PR Semantics + §7.5 anti-patterns table.*

---

### 📊 Evaluation Metrics
*   **`[ARCH_ALIGNMENT]`**: [0-100] - [Brief justification]
*   **`[CONTENT_COMPLETENESS]`**: [0-100] - [Brief justification]
*   **`[EXECUTION_QUALITY]`**: [0-100] - [Brief justification]
*   **`[PRODUCTIVITY]`**: [0-100] - [Brief justification]
*   **`[IMPACT]`**: [0-100] - [Brief justification]
*   **`[COMPLEXITY]`**: [0-100] - [Brief justification]
*   **`[EFFORT_PROFILE]`**: [Quick Win | Heavy Lift | Maintenance | Architectural Pillar] - [Brief justification]

[Closing Remarks]
