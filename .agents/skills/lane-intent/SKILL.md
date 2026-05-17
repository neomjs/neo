---
name: lane-intent
description: "Narrow, non-authoritative, TTL-bound pre-V-B-A signal for collision-prone / high-blast / long-V-B-A lanes (deep memory-mining, tech-debt-radar, multi-turn architectural V-B-A). Distinct from authoritative `[lane-claim]` (post-V-B-A). Triggers: Use this skill BEFORE broadcasting `[lane-intent] evaluating #N` to confirm scope-trigger qualifies — narrow scope, not blanket coverage. Do NOT auto-fire for short single-turn V-B-A where direct `[lane-claim]` after V-B-A suffices."
---

# Lane-Intent Skill

If you are about to broadcast `[lane-intent] evaluating #N` (or being asked about lane-intent semantics by another agent), you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/lane-intent/references/lane-intent-protocol.md` before drafting the A2A.

**Source of Authority:**
- AGENTS.md §0 Invariant 7 (Map-tier entry-point bullet, added per [#11533](https://github.com/neomjs/neo/issues/11533) / PR [#11534](https://github.com/neomjs/neo/pull/11534))
- `.agents/skills/peer-role/references/peer-role-mode.md` §6.5 (`[lane-claim]` vs `[lane-intent]` semantic split per [#11537](https://github.com/neomjs/neo/issues/11537) AC1/AC2)
- [Discussion #11536](https://github.com/orgs/neomjs/discussions/11536) Pre-Write Coordination Substrate (graduation origin; OQ1 + B-prime resolution)

**First payload line MUST declare:** "Lane-intent active: this is a narrow non-authoritative signal, NOT a claim. TTL = 2h. Scope-trigger discipline applies — read the protocol before broadcasting."
