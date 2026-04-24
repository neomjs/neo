# PR Review Summary

**Status:** [Approved / Request Changes / Comment]

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

### 🔗 Cross-Skill Integration Audit

*(Required per guide §8.1 when the PR touches skill files, conventions, MCP tool surfaces, `AGENTS_STARTUP.md` / `AGENTS.md`, or architectural primitives. Mark N/A for routine code changes that don't introduce cross-substrate conventions.)*

- [ ] Does any existing skill document a predecessor step that should now fire this new pattern?
- [ ] Does `AGENTS_STARTUP.md` §9 Workflow skills list need updating?
- [ ] Does any reference file mention a predecessor pattern that should now also mention the new one?
- [ ] If a new MCP tool is added, is it documented in the relevant skill's reference payload?
- [ ] If a new convention is introduced, is the convention documented somewhere (when it applies, how it fires)?

**Findings:** [Gaps surfaced by the checklist, or "All checks pass — no integration gaps." Any gap should also appear in Required Actions below.]

---

### 📋 Required Actions

**For PRs with required actions — use the checkbox list form:**

To proceed with merging, please address the following:

- [ ] Item 1 (e.g., Add missing JSDoc to `newMethod`)
- [ ] Item 2 (e.g., Fix the race condition in `Store.js` loading)
- [ ] Item 3

**For zero-issue PRs — use the null-state sentence:**

No required actions — eligible for human merge.

*Do NOT use pre-ticked placeholder items like `- [x] All checks pass and no required changes identified.` — that reads as box-checking, not genuine review. Per guide §5 Zero-Issue PR Semantics + §7.3 anti-patterns table.*

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
