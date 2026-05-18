# Lane-Intent Protocol

*(Per #11537, graduated from Discussion #11536 OQ1. Deep rationale + canonical examples + edge cases → ADR 0010.)*

<a id="the-essential"></a>
## 0. The Essential

**`[lane-intent]` is a narrow, non-authoritative, 2-hour TTL-bound A2A broadcast signaling peers you are EVALUATING a lane but have NOT yet completed V-B-A or written anything.**

```
[lane-intent] evaluating #N    ← non-authoritative, pre-V-B-A, narrow scope, 2h TTL
[lane-claim] taking #N         ← authoritative, post-V-B-A, immediately-before-write
[lane-override] reclaiming #N  ← corrective handoff, 2h TTL (peer-role-mode §6.5.1)
```

**Non-authoritative semantics**: `[lane-intent]` does NOT count in peer-role-mode §6.6 Source-of-Authority hierarchy. A peer who proceeds past it is NOT violating substrate. Yield if a peer posts `[lane-claim]` faster.

<a id="scope-trigger-gate"></a>
## 1. Scope-Trigger Gate

`[lane-intent]` is **OPTIONAL** and **NARROW**. Broadcast ONLY when ALL three conditions hold:

1. **Collision-prone context** — visible duplicate-exploration risk (recently-touched substrate, high-blast topic, adjacent peer activity)
2. **Long V-B-A required** — spans multiple turns OR heavy tooling (`/memory-mining`, `/tech-debt-radar`, deep `ask_knowledge_base`)
3. **Real duplicate-work risk** — peer could plausibly start parallel exploration within the V-B-A window

Missing ANY → just complete V-B-A locally + `[lane-claim]` directly. Canonical positive/negative examples + edge cases: ADR 0010.

<a id="required-a2a-shape"></a>
## 2. Required A2A Shape

```
Subject: [lane-intent] evaluating #N
        OR
        [lane-intent] evaluating <substrate-description-with-stable-id>

Body:
- WHAT: brief evaluation scope
- WHY: which of the 3 scope-triggers fires
- TIMELINE: rough V-B-A window
- CONVERTS-TO: `[lane-claim] taking #N` or `[yield] <reason>`

Recipient: AGENT:*
```

**Path-determinism**: unticketed substrate-descriptions need stable URL / discussion-number / explicit-substrate-ID (machine-queryable). Free-form forbidden.

<a id="ttl-and-recovery"></a>
## 3. TTL and Recovery

**TTL: 2 hours** (session lifespan). After 2h, `[lane-intent]` expires — consumers MUST ignore.

**Read-path semantics**: consumer-enforced. `list_messages` readers compute `sentAt + TTL` and treat expired as inert. Substrate does NOT auto-delete.

**Expiration paths**:
- **Converted to `[lane-claim]`** — V-B-A done; claim supersedes
- **Converted to `[yield]`** — V-B-A surfaced blocker/conflict/better path
- **TTL-expired silently** — peer moved on; lane available

<a id="tool-side-complement"></a>
## 4. Tool-Side Complement

`[lane-intent]` is purely A2A. The mechanical assignee gate is `manage_issue_assignees` per #11537 (precondition + post-verify, fires post-V-B-A during `[lane-claim]`, NOT during `[lane-intent]` phase). Pre-V-B-A self-assign is forbidden.

<a id="anti-patterns"></a>
## 5. Anti-Patterns

- **Blanket `[lane-intent]`** — over-triggering for every lane-pickup
- **`[lane-intent]` as authority surrogate** — citing it in §6.6 conflict resolution
- **`[lane-intent]` for short single-turn V-B-A** — over-triggering
- **Open-ended intent** — no `CONVERTS-TO` declared → discipline-dressed-deference
- **TTL ignored on read-path** — treating 8-hour-old intent as live state
- **Self-assigning during `[lane-intent]` phase** — assignment is post-V-B-A only

<a id="cross-references"></a>
## 6. Cross-References

- AGENTS.md [Critical Gates Invariants](../../../../AGENTS.md#critical-gates-invariants) Invariant 7 — Map-tier entry-point (per #11534)
- peer-role-mode §6.5 / §6.5.1 / §6.6 / [The Pull Request Mandate Definition of Done MACHINE-ENFORCEABLE-CANDIDATE](../../../../learn/agentos/AGENTS_ATLAS.md#the-pull-request-mandate-definition-of-done-machine-enforceable-candidate) — `[lane-claim]` semantics + `[lane-override]` + authority hierarchy + anti-patterns
- ADR 0010 — substrate-evolution rationale + canonical examples + edge cases + sister primitives
