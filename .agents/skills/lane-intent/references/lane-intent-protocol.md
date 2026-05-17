# Lane-Intent Protocol

*(Codified per [#11537](https://github.com/neomjs/neo/issues/11537), graduated from [Discussion #11536](https://github.com/orgs/neomjs/discussions/11536) Pre-Write Coordination Substrate OQ1 + B-prime convergence.)*

## 0. The Essential

**`[lane-intent]` is a narrow, non-authoritative, 2-hour TTL-bound A2A broadcast that signals peers you are EVALUATING a lane but have NOT yet completed V-B-A or written anything.**

It is distinct from `[lane-claim]` (authoritative, post-V-B-A, immediately-before-write). Mis-use creates the discipline-dressed-deference anti-pattern (intent-without-execution).

```
[lane-intent] evaluating #N    ← non-authoritative, pre-V-B-A, narrow scope, 2h TTL
[lane-claim] taking #N         ← authoritative, post-V-B-A, immediately-before-write
[lane-override] reclaiming #N  ← corrective handoff, 2h TTL (per peer-role-mode §6.5.1)
```

## 1. When to Broadcast `[lane-intent]` — Scope-Trigger Discipline

`[lane-intent]` is **OPTIONAL** and **NARROW**. Broadcast ONLY when ALL three conditions hold:

1. **Collision-prone context** — the lane has visible duplicate-exploration risk (recently-touched substrate, high-blast topic, active session activity from another peer in adjacent area).
2. **Long V-B-A required** — V-B-A scope-validation will span multiple turns OR involve heavy tooling (`/memory-mining` cycles, `/tech-debt-radar` queries spanning many files, deep `ask_knowledge_base` lookups requiring synthesis).
3. **Real duplicate-work risk** — without the signal, a peer could plausibly start parallel exploration of the same lane within the V-B-A window.

If ANY of the three is missing, just complete V-B-A locally and broadcast `[lane-claim]` directly when ready to write. The substrate has costs (A2A volume, graph-ingestion noise); over-triggering dilutes the signal.

### Canonical positive examples

- *"I'm about to run `/tech-debt-radar` over `ai/daemons/` looking for cascade fragility. Multi-turn V-B-A expected. Broadcasting `[lane-intent] evaluating ai/daemons/cascade-audit` so peers don't start parallel."*
- *"Considering an Ideation Sandbox proposal for X. V-B-A will involve cross-skill substrate scan + multiple Discussion threads. Broadcasting `[lane-intent] evaluating #NNNN ideation-sandbox-proposal-X` to signal peers."*
- *"Picking up an epic-review on #N. Substrate is broad; V-B-A will take 2-3 turns. Broadcasting `[lane-intent] evaluating #N epic-review` so peers know I'm in deep-eval mode."*

### Canonical negative examples (DO NOT use `[lane-intent]` here)

- *"About to file ticket #N about issue X."* → just file it, then `[lane-claim]` if you're starting implementation in same session.
- *"About to V-B-A check #N for assignee state."* → that's a single-tool-call read; `[lane-intent]` is over-triggering.
- *"Thinking about whether to claim #N."* → discipline-dressed-deference. Either V-B-A locally + claim, or yield silently.
- *"Want peers to know I might work on something later today."* → not a duplicate-work risk; A2A coordination noise.

## 2. Required A2A Shape

```
Subject: [lane-intent] evaluating #N
        OR
        [lane-intent] evaluating <substrate-description-with-stable-id>

Body:
- WHAT: brief description of the evaluation scope
- WHY: why this lane qualifies for `[lane-intent]` (which of the 3 scope-triggers fires)
- TIMELINE: rough V-B-A window expectation (e.g., "2-3 turns", "until session sunset")
- CONVERTS-TO: explicit statement of what completes the intent → either `[lane-claim] taking #N` or `[yield] V-B-A surfaced blocker / conflict / better path`

Recipient: AGENT:*
```

**Path-determinism note (per GPT STEP_BACK §2 carry-forward, #11537 AC):** for unticketed substrate-descriptions, the identity MUST be machine-queryable — use a stable URL, discussion number, or explicit substrate ID (e.g., `[lane-intent] evaluating .agents/skills/lead-role-mode-rewrite`). Free-form descriptions ("evaluating a thing") are forbidden.

## 3. Non-Authoritative Semantics (CRITICAL)

`[lane-intent]` is **NOT** Current Public Authority in the `.agents/skills/peer-role/references/peer-role-mode.md` §6.6 conflict-resolution hierarchy. It does NOT count for:

- Resolving lane conflicts ("I broadcast `[lane-intent]` first" is NOT a winning argument)
- Self-assigning issues (DO NOT trigger `manage_issue_assignees` before V-B-A completes)
- Opening PRs (impossible without V-B-A complete)

A peer who sees your `[lane-intent]` and proceeds to write anyway is NOT violating substrate — your intent was non-authoritative by design. The signal is informational, not blocking.

If you broadcast `[lane-intent]` and a peer completes V-B-A faster + posts `[lane-claim]` on the same lane: yield. Your intent was a soft pre-signal; the post-V-B-A claim has authority.

## 4. TTL and Recovery

**TTL: 2 hours** (aligned with standard session lifespan). After 2h, the `[lane-intent]` expires automatically — consumers MUST ignore it.

**Read-path semantics (per GPT STEP_BACK §4 carry-forward, #11537 AC):** the TTL is consumer-enforced. Agents reading `list_messages` MUST compute `sentAt + TTL` and treat expired `[lane-intent]` as inert. The substrate does NOT auto-delete; the read-path filters.

**Expiration paths:**
- **Converted to `[lane-claim]`** — V-B-A completed in <2h, peer proceeds. The `[lane-claim]` supersedes the `[lane-intent]` (which becomes historical context).
- **Converted to `[yield]`** — V-B-A surfaced a blocker, conflict, or better path. Peer explicitly yields. The `[lane-intent]` is closed out via the yield A2A.
- **TTL-expired silently** — peer crashed, got stuck, or moved to different work. After 2h, peers may proceed on the lane without further coordination.

## 5. Tool-Side Complement

`[lane-intent]` is purely an A2A coordination primitive. No tool-side gate enforces it. The complementary mechanical gate is `manage_issue_assignees` per [#11537](https://github.com/neomjs/neo/issues/11537):

- `manage_issue_assignees` with `requireUnassigned: true` (default) prevents blind-add to occupied issues
- `acknowledgedReassign: '<reason>'` is the override path (strict-replacement + audit-trail comment)
- The gate fires post-V-B-A when self-assigning during `[lane-claim]` — NOT during `[lane-intent]` phase (assignment is forbidden pre-V-B-A)

## 6. Anti-Patterns (Each fires halt-and-audit)

- **Blanket `[lane-intent]`** — broadcasting for every lane-pickup regardless of duplicate-risk. Substrate cost without value. Empirical anchor: Discussion #11536 v4 body matrix Option A (rejected as blanket).
- **`[lane-intent]` as authority surrogate** — citing your own `[lane-intent]` as Current Public Authority in §6.6 conflict resolution. Non-authoritative by design.
- **`[lane-intent]` for short single-turn V-B-A** — V-B-A that completes in one turn does NOT qualify for the pre-signal. Just complete + `[lane-claim]`.
- **`[lane-intent]` without explicit converts-to** — A2A body must declare what completes the intent (`[lane-claim]` or `[yield]`). Open-ended intents drift into discipline-dressed-deference.
- **TTL ignored on read-path** — consumers treating an 8-hour-old `[lane-intent]` as live state. Expired intents are inert.
- **Self-assigning the ticket during `[lane-intent]` phase** — assignment is post-V-B-A discipline; `manage_issue_assignees` precondition gate (per #11537) will trip `ASSIGNEE_CONFLICT` if another peer already claimed.

## 7. Cross-References

- **AGENTS.md §0 Invariant 7** — Map-tier entry-point bullet (added per #11533 / PR #11534)
- **`.agents/skills/peer-role/references/peer-role-mode.md` §6.5** — `[lane-claim]` vs `[lane-intent]` semantic split + AC2 post-V-B-A timing rule
- **`.agents/skills/peer-role/references/peer-role-mode.md` §6.5.1** — sister `[lane-override]` protocol with 2h TTL
- **`.agents/skills/peer-role/references/peer-role-mode.md` §6.6** — Source-of-Authority Collision Check (`[lane-intent]` does NOT count)
- **`.agents/skills/peer-role/references/peer-role-mode.md` §7** — Anti-pattern catalog (pre-V-B-A `[lane-claim]` / gh CLI bypass / blanket `[lane-intent]`)
- **[Discussion #11536](https://github.com/orgs/neomjs/discussions/11536)** — graduation origin (Pre-Write Coordination Substrate)
- **[#11537](https://github.com/neomjs/neo/issues/11537)** — implementation ticket (AC1 lane-intent definition + AC2 lane-claim timing + AC3/AC4 manage_issue_assignees gate + AC10 lane-override TTL)
