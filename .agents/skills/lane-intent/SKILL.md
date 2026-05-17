---
name: lane-intent
description: "Narrow, non-authoritative, TTL-bound pre-V-B-A signal for collision-prone / high-blast / long-V-B-A lanes (deep memory-mining, tech-debt-radar, multi-turn architectural V-B-A). Distinct from authoritative `[lane-claim]` (post-V-B-A). Triggers: Use this skill BEFORE broadcasting `[lane-intent] evaluating #N` to confirm scope-trigger qualifies — narrow scope, not blanket coverage. Do NOT auto-fire for short single-turn V-B-A where direct `[lane-claim]` after V-B-A suffices."
---

# Lane-Intent Skill

Before broadcasting `[lane-intent] evaluating #N` OR explaining lane-intent semantics, read `.agents/skills/lane-intent/references/lane-intent-protocol.md` for the 3-condition scope-trigger gate, TTL+recovery semantics, and anti-patterns.

**Source of Authority:** AGENTS.md §0 Inv 7 (Map entry-point) + peer-role-mode §6.5 ([lane-claim] vs [lane-intent] split per #11537) + Discussion #11536 graduation + ADR 0010 (deep rationale).

**First payload line MUST declare:** "Lane-intent active: narrow non-authoritative pre-V-B-A signal, 2h TTL. Scope-trigger discipline applies — read protocol before broadcasting."
