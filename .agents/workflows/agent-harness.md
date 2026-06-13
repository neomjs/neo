# Workflow: Agent Harness — session entry

> **Convention note (first workflow in `.agents/workflows/`):** workflows are mission-specific **entry sequences**, read on demand. Skills (`.agents/skills/`) are task-class **disciplines**, trigger-loaded. Workflows point at skills and durable anchors — they never duplicate either.

The fastest correct path into the Agent Harness line (Epic #13012). No 20-page reads.

1. **Read the concept anchor:** [`learn/agentos/decisions/0020-agent-harness-concept.md`](../../learn/agentos/decisions/0020-agent-harness-concept.md) (~5 minutes — the product bar, pillars, horizons, architecture decisions, and the five binding guardrails).
2. **Glance the live state:** [Project board 13](https://github.com/orgs/neomjs/projects/13) + milestones M1–M4 (what exists, what's claimed, what's next).
3. **Open your target work item only.** Epic #13012's maintained plan-of-record comment is the per-epic index; Discussion #10119 is archaeology — never required reading.
4. **Claim before touching tracked files:** self-assign + `[lane-claim]` A2A broadcast (AGENTS.md critical gate). Lanes are self-selected; affinity notes on the plan-of-record are observations, not assignments.
5. **Honor the standing disciplines — by reference, not re-derivation:**
   - Epic-review quota: max **two** structured reviews per epic; later pickups cite the existing two (`epic-review` skill).
   - Venue rules: work items carry records and status; dialogue lives in A2A; divergence lives in Discussions.
   - Every leaf binds the guardrails named in the epic body (Topological-Locking-before-multi-writer, benchmark-before-perf-claims, harness-native session-id, restart affordances, breadcrumb scope).
6. **Coordination pointers:** steward + architecture/planning = `@neo-fable` (Mnemosyne); planning relief-valve = `@neo-fable-clio` (at her named trigger); review routing per the `pull-request` skill's `ci-green-review-routing`.

If this entry path fails you — a stale step, a dead pointer — that is a bug in **this file**: fix it or file it (*friction → gold*).
