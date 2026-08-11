# PR Review Summary

**Status:** [Approved / Approve+Follow-Up / Request Changes / Drop+Supersede / Comment]

*Cycle-1 reviewers: run §9.0 Premise Pre-Flight BEFORE composing Required Actions. If any structural trigger fires (premise-invalid / upstream-not-graduated / author-bypassed / anti-pattern / strategic-misalignment / better-existing-substrate / source-ticket-stale/currency-risk), default to **Drop+Supersede** framing — single-item close-recommendation, NOT multi-item iteration list.*

### 🪜 Strategic-Fit Decision

Per §9 Strategic-Fit Step-Back:
- **Decision**: [Approve / Approve+Follow-Up / Request Changes / Drop+Supersede]
- **Rationale**: [Why this decision shape vs the others. Remember: Approve+Follow-Up is the worst normal outcome; debt-creating quick wins are Request Changes or Drop+Supersede, not follow-up-ticket fuel.]

**Required only when Decision is Drop+Supersede:**

- **Disposition:** [implementation-off | ticket-prescription-off | ticket-premise-dead]
- **Source-coordinate falsifiers:** [exact paths/lines/anchors proving the premise failure]
- **Salvage map:** [what is reusable, where it lands, and what is discarded]
- **Successor landing pad:** [ticket / amended ticket / closure artifact]
- **Successor map citation:** [successor URL or anchor that cites this salvage map]

**Peer-Review Opening:** [Friendly Opening / General encouragement. e.g., "Thanks for putting this together! Great approach to solving [Problem]. I've left some review notes below. Let's get these squared away so we can merge."]

**Self-Review Opening:** [Clinical assessment. e.g., "Self-review of #[Ticket]. This implementation chose [approach] over [alternative] because [rationale]. Key trade-offs and gaps noted below."]

*(Use exactly one opening based on the self-review detection result from the guide.)*

---

### 🧭 Patch-Blind Premise Snapshot

*Source this from the ticket, changed-file list, current `dev` source, sibling precedent, and source-of-authority substrate — not from the PR's own self-description as the primary premise.*

*   **Inputs Read Before Patch:** [Ticket / issue, changed-file list, current `dev` source, sibling precedent, source-of-authority substrate read before treating the patch as evidence.]
*   **Expected Solution Shape:** [1-3 sentences: expected surface, simplest acceptable shape, what boundary this must NOT hardcode, and what test isolation should exist.]
*   **Patch Verdict:** [Matches / improves / contradicts the expected shape, with the specific diff/source evidence that confirmed or changed your premise.]
*   **Premise Coherence:** [Does this PR's premise cohere with our core values — verify-before-assert · friction→gold · flat-peer-team · no-hold · the two-hemisphere organism? A specific verdict naming the value ("coheres: lead stays facilitator-not-delegator" / "conflicts: adds surveillance vs flat-peer-team"), NOT a bare yes/no. OR a scoped "N/A — no value-surface (scope: ...)" for a trivial PR. A green checklist over a wrong premise is theater.]

---

### 🕸️ Context & Graph Linking
*   **Target Epic / Issue ID:** Resolves #[Issue Number]
*   **Related Graph Nodes:** [Any other related node IDs or conceptual tags]
*   **Origin Session ID:** [Neo Memory Core UUID, not harness/task/transcript]

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
- [ ] Anchor & Echo summaries: precise codebase terminology, no metaphor or source-code snapshot anchor (ticket/PR/lane/AC/cycle/line number) that overshoots durable intent
- [ ] `[RETROSPECTIVE]` tag: accurately characterizes what shipped (no inflation of architectural significance)
- [ ] Linked anchors: cited tickets/PRs actually establish the claimed pattern (no borrowed authority)

**Findings:** [Pass / specific drift flagged with Required Action / N/A]

---

### 🧠 Graph Ingestion Notes

*   **`[KB_GAP]`**: [If applicable, document any framework concepts misunderstood in this PR]
*   **`[TOOLING_GAP]`**: [If applicable, document any issues with tooling, tests, or MCP execution that occurred during this PR's lifespan]
*   **`[RETROSPECTIVE]`**: [High-level architectural takeaways or praise that should be permanently remembered]

---

### 🧱 Conciseness Rule — Collapsed-N/A Audits

When 2+ expanded audit dimensions below evaluate **N/A** for the PR scope (e.g., test-reliability fix, docs-only change, micro-refactor), collapse them under a single section using the explicit canonical-anchor format:

```
### N/A Audits — 📑 🪜 📡 🔗 🧪
N/A across listed dimensions: <one-line reason for the PR-scope justification>.
```

(Substitute only the emoji subset that's actually N/A. Use spaces between emojis, single-space-emdash separator after `Audits`.)

**Mixing rule (CRITICAL)**: substantive audit sections — any non-N/A finding — MUST be expanded individually under their canonical header. Never collapse a dimension with actual findings. Mixing collapsed-N/A-block with substantive-expanded-sections is the substrate-correct shape for non-trivial-scope PRs that have ONE substantive audit dimension + many N/A dimensions.

---

### 🎯 Close-Target Audit

*(Required per guide §5.2 when the PR body or commit messages contain `Closes #N` / `Resolves #N` / `Fixes #N` magic keywords. This is part of the 10% AC/audit sanity layer: binding on real overclaims, not a substitute for premise or placement. Mark N/A for PRs without close-target keywords.)*

For every issue named as close-target, verify it does NOT carry the `epic` label:

- [ ] Close-targets identified: [list of `#N` references, or "none"]
- [ ] For each `#N`: confirmed not `epic`-labeled (or flagged as Required Action below)

**Findings:** [Pass / specific epic flagged / N/A]

---

### 📑 Contract Completeness Audit

*(Required per guide §5.4 when the PR introduces or modifies public/consumed surfaces. This is part of the 10% AC/audit sanity layer: binding on real drift, not proof that the work belongs here. Mark N/A for PRs that don't touch these surfaces.)*

- [ ] Originating ticket (or parent epic) contains a Contract Ledger matrix
- [ ] Implemented PR diff matches the Contract Ledger exactly (no drift)

**Findings:** [Pass / missing ledger flagged / contract drift flagged / N/A]

---

### 🪜 Evidence Audit

*(Required when the PR's close-target ACs include observable runtime effect on a surface the CI / agent sandbox cannot reach — substrate / harness / wake / restart / UI-with-visual-AC / CLI-with-host-behavior PRs. This is part of the 10% AC/audit sanity layer: binding on real evidence mismatch, not a replacement for architecture review. Mark N/A for PRs where ACs are fully covered by unit tests / static contract.)*

Reference: [`learn/agentos/process/evidence-ladder.md`](../../../../learn/agentos/process/evidence-ladder.md) for L1-L4 ladder + sandbox-vs-achievable ceiling distinction.

The PR body must declare achieved evidence in 1-line greppable form:

```md
Evidence: L<X> (<sandbox-ceiling description>) → L<Y> required (<close-target ACs requiring it>). Residual: AC<N>, Residual-Owner: #<an EXISTING open ticket that is NOT the close target>.
```

- [ ] PR body contains an `Evidence:` declaration line (or N/A justified inline)
- [ ] Achieved evidence ≥ close-target required evidence, OR residuals are explicitly listed in the PR's `## Residual / Post-Merge Validation` section
- [ ] If residuals exist: close-target issue body has the residuals annotated as `[L<N>-deferred — operator handoff needed]`
- [ ] Two-ceiling distinction: PR body distinguishes "shipped at L<X> because sandbox ceiling" from "shipped at L<X> because author didn't probe further"
- [ ] Evidence-class collapse check: review language does NOT promote L1/L2 evidence to L3/L4 framing without explicit sandbox-ceiling caveat
- [ ] Deployment causality: any external/runtime receipt used as a merge gate is reachable from this exact unmerged head through a verified branch-artifact route; otherwise it is Post-Merge Validation and failure creates a new ticket

**Findings:** [Pass / evidence-AC mismatch flagged / N/A — close-target ACs fully covered by unit tests]

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

### Conditional Audit Triggers

Expand these audits only when their trigger fires; otherwise omit them rather than rendering default N/A sections:

- **🛂 Provenance Audit:** PR introduces a major architectural abstraction or core subsystem.
- **📜 Source-of-Authority Audit:** review cites operator or peer authority for a demand.
- **🔌 Wire-Format Compatibility Audit:** PR alters JSON-RPC notification schemas, payload envelopes, native API wire formats, event payloads, tool signatures, or database schemas.
- **🧠 Turn-Memory / Substrate-Load Audit:** PR modifies files in `/turn-memory-pre-flight` IN-SCOPE list. Verify the author documented the decision-tree application and load-effect audit in the PR body; if missing, load `audits/loading-runtime-effect.md` and use its Required Action template.

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

### 🧪 Test-Evidence & Location Audit

*(Required per guide §7.5. Current-head CI is the default unit/integration evidence; reviewers run tests only as named falsifiers.)*

- [ ] Execution evidence: exact-head required CI [green at `<SHA>` / N/A — docs-template] + author per-surface non-CI receipt [present and current-head-appropriate / obvious omission flagged / N/A — docs-template]
- [ ] Reviewer falsifier: [N/A — no named behavioral concern / command + named concern + result]
- [ ] Test location: [pass for added/moved tests / N/A]

**Findings:** [Pass / author evidence gap / falsifier failed / incorrect test placement]

---

### 📋 Required Actions

**For PRs with required actions — use the checkbox list form:**

To proceed with merging, please address the following:

- [ ] Item 1 (e.g., Add missing JSDoc to `newMethod`)
- [ ] Item 2 (e.g., Fix the race condition in `Store.js` loading)
- [ ] Item 3

**For zero-issue PRs — use the null-state sentence:**

No required actions — eligible for human merge.

*Do NOT use pre-ticked placeholder items like `- [x] All checks pass and no required changes identified.` — that reads as box-checking, not genuine review. Per the guide's Zero-Issue PR Semantics and anti-patterns table.*

---

### 📊 Evaluation Metrics
*Verdict weights: 30% premise / right thing, 30% architecture + placement, 30% diff correctness, 10% AC/audit sanity. These are importance-to-verdict weights, not effort budgets.*

*   **`[ARCH_ALIGNMENT]`**: [0-100] - [Neo paradigms + placement/cohesion/folder-fit/boundary discipline justification; placement violations cap the score]
*   **`[CONTENT_COMPLETENESS]`**: [0-100] - [Brief justification]
*   **`[EXECUTION_QUALITY]`**: [0-100] - [Brief justification]
*   **`[PRODUCTIVITY]`**: [0-100] - [Brief justification]
*   **`[IMPACT]`**: [0-100] - [Brief justification]
*   **`[COMPLEXITY]`**: [0-100] - [Brief justification]
*   **`[EFFORT_PROFILE]`**: [Quick Win | Heavy Lift | Maintenance | Architectural Pillar] - [Brief justification]

[Closing Remarks]
