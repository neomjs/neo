# Wake Substrate Incident Protocol

> **The wake substrate is a multi-layer side-effect machine — it pastes into harness UIs, spawns sessions, mutates Memory Core state, and steals focus. Restart is not a neutral cleanup step. It is a release event that requires preflight inventory, evidence-based reactivation, and a documented incident retrospective.**

This protocol governs how the swarm responds to wake-substrate regressions: when to declare an incident, what stays disabled during it, how to validate before reactivation, and how the post-incident retrospective feeds the substrate's next evolution. It is the operator-facing companion to the wake safety gate ([#10648](https://github.com/neomjs/neo/issues/10648)) and the cross-harness prompt-landing matrix ([#10649](https://github.com/neomjs/neo/issues/10649)) under the Wake Incident Safety Tree epic ([#10647](https://github.com/neomjs/neo/issues/10647)).

The protocol is operational discipline — preflight checklists, gate-state semantics, coordination patterns. Specific incident retrospectives accumulate as comments on [#10647](https://github.com/neomjs/neo/issues/10647) using the [post-incident retrospective template](#post-incident-retrospective-template) below.

---

## When to Declare an Incident

Declare a wake-substrate incident when any of these symptoms occur:

- **Unsanctioned harness spawning** — Claude Desktop / Antigravity / Codex Desktop sessions opening without an explicit `session-sunset` predicate having fired.
- **Wake payload landing outside the agent prompt surface** — file writes, focus-steal into editors, or any side effect downstream of `osascript` exit-0 that did NOT reach the chat composer.
- **Cross-harness wake delivery divergence** — wake-daemon log reports successful delivery to one harness while the other silently strands (per [#10644](https://github.com/neomjs/neo/issues/10644) Antigravity case + [#10645](https://github.com/neomjs/neo/issues/10645) Codex case).
- **Operator manual intervention to stop scheduler-driven actions** — if you are killing PIDs to halt orphan-spawn, that IS the incident's existence proof.
- **Repeated regression of a previously-shipped substrate primitive** — if a wake substrate behavior that worked in a prior session breaks after a release/restart, treat the regression as substrate-incident shape rather than ordinary bug.

Once declared, the protocol's freeze rule applies until reactivation evidence is satisfied.

---

## The Freeze Rule

**While an incident is active, no individual local fix authorizes wake-substrate reactivation.** Heartbeat stays off, the wake safety gate stays `tripped` (or `disabled`), the wake daemon stays stopped, and `WAKE_GATE_OVERRIDE=1` is NOT set unless the operator explicitly authorizes a controlled validation step.

This rule exists because the failure mode is cross-layer. Empirical experience has shown the swarm repeatedly marking one of the eight wake-substrate layers green and discovering a failure at a neighboring layer:

1. A2A mailbox storage
2. unread / list semantics
3. `WAKE_SUBSCRIPTION` bootstrap and metadata
4. coalescing / raw envelope shape
5. wake-daemon / MCP / native adapter targeting
6. prompt payload landing in agent prompt surface
7. fresh-session recovery (only after explicit sunset)
8. heartbeat / scheduler treating uncertain state as unsafe

Reactivation requires green at the loop level, not at any single layer.

---

## Restart Preflight Checklist

Before any wake daemon, Memory Core MCP, or harness app restart during an active incident, the operator (or their delegated agent) MUST execute and record this inventory:

### Process inventory

```bash
# Wake daemon
cat .neo-ai-data/wake-daemon/wake-daemon.pid 2>/dev/null
ps aux | grep -E "daemons/wake/daemon" | grep -v grep

# Orchestrator daemon — drives the swarm-heartbeat lane since #11766
# (there is no standalone swarm-heartbeat process anymore)
cat .neo-ai-data/orchestrator-daemon/orchestrator-daemon.pid 2>/dev/null
ps aux | grep -E "orchestrator-daemon" | grep -v grep

# Active resumeHarness invocations (should be zero in steady-state)
ps aux | grep -E "resumeHarness" | grep -v grep
```

Record every PID found, its start time, and the working directory. Multiple `orchestrator-daemon` instances are a hazard: duplicated heartbeat lanes amplify orphan-spawn under any cross-layer regression by multiplying scheduler cycles. The Orchestrator entry-point enforces a PID-file singleton, so a second instance usually indicates a stale PID file or a failed SIGTERM handoff.

### Wake safety gate state

```bash
node ai/scripts/wakeSafetyGate.mjs show
```

Record the state, reason, `trippedAt`, and `trippedBy`. The gate state is the canonical authority on whether the substrate is considered safe; anything other than `enabled` means scheduler/recovery paths fail-closed.

### Subscription inventory

```bash
sqlite3 .neo-ai-data/sqlite/memory-core-graph.sqlite \
  "SELECT id, json_extract(data, '\$.properties.agentIdentity'), json_extract(data, '\$.properties.harnessTarget'), json_extract(data, '\$.properties.harnessTargetMetadata') \
   FROM Nodes WHERE json_extract(data, '\$.label') = 'WAKE_SUBSCRIPTION'"
```

Active subscriptions for `@neo-opus-ada`, `@neo-gemini-pro`, and `@neo-gpt` mean the wake daemon will deliver wake events to those identities the moment it starts. If the substrate is unsafe, those subscriptions must either be temporarily disabled OR the wake daemon must be started in a controlled validation mode that ignores them.

### Wake backlog fence

This is the load-bearing preflight that distinguishes "wake-daemon restart" from "drain every wake-eligible event since `lastSyncId`."

```bash
# Wake daemon's last-acknowledged GraphLog ID
cat .neo-ai-data/wake-daemon/lastSyncId 2>/dev/null

# Current max GraphLog log_id
sqlite3 .neo-ai-data/sqlite/memory-core-graph.sqlite \
  "SELECT MAX(log_id) FROM GraphLog"

# Pending row count + ID range
sqlite3 .neo-ai-data/sqlite/memory-core-graph.sqlite \
  "SELECT COUNT(*), MIN(log_id), MAX(log_id) FROM GraphLog \
   WHERE log_id > <lastSyncId>"
```

If the pending count is non-zero, the operator MUST choose ONE of these paths and document the choice in the incident record before the wake daemon starts:

- **Disable wake subscriptions** — the wake daemon starts and drains, but no wake events reach harnesses (subscriptions are inert).
- **Advance `lastSyncId` after a durable-mailbox audit** — the operator confirms that no pending event needs to wake a harness (because the recipient already saw the message via mailbox poll), then writes the new `lastSyncId` so the wake daemon skips the backlog on start.
- **Run a targeted matrix / test wake-daemon** — a non-production wake-daemon instance that ignores the canonical backlog and exercises only the [#10649](https://github.com/neomjs/neo/issues/10649) prompt-landing matrix tests.

**Wake-daemon restart as a background service action is prohibited** while active subscriptions exist AND wake delivery is considered unsafe. Backlogs of hundreds of pending rows are common after even short downtime windows; restarting the wake daemon without a chosen path floods the harnesses with the entire pending stream the moment it acks subscriptions.

---

## Reactivation Evidence Requirements

The freeze rule lifts only when ALL of the following hold:

- **Wake safety gate is `enabled`** ([#10648](https://github.com/neomjs/neo/issues/10648)). `node ai/scripts/wakeSafetyGate.mjs check` exits 0 without `WAKE_GATE_OVERRIDE`.
- **Cross-harness prompt-landing matrix is green** ([#10649](https://github.com/neomjs/neo/issues/10649)). Each row (Claude Desktop, Antigravity, Codex Desktop) has documented evidence at every column from A2A storage through prompt landing through no-editor-mutation.
- **Active local-regression tickets are merged** — at minimum the regressions known to break the loop. Tickets per incident vary; the principle is that no known broken-loop regression remains open at reactivation time.
- **Wake backlog fence has been chosen and documented** per the preflight checklist above.

OR

- **The operator (`@tobiu` for the canonical `neomjs/neo` repository) has explicitly accepted the residual risk** — recorded as a comment on the incident-tracking issue or a signed-off `WAKE_GATE_OVERRIDE=1` invocation tied to a specific time-bounded validation step.

A passing unit test alone does NOT satisfy reactivation. The substrate's failure mode is loop-level; reactivation evidence must be loop-level.

---

## Coordination Mode During an Incident

While wake delivery is disabled, the swarm coordinates exclusively via the durable mailbox: `add_message` writes the message into SQLite, `list_messages` polls the inbox. Wake events do not arrive; agents check their mailbox at session start (per `AGENTS.md` §21 mailbox-check Pre-Flight) and at any interruption.

**Do not assume wake interrupts will arrive during an incident.** If a peer is silent on a coordination question, the cause is more likely "they have not polled their mailbox since you wrote" than "they declined to respond." When in doubt, ask the operator to relay (manual ping pattern: operator pokes the recipient's IDE chat to trigger a mailbox poll).

The mailbox path is independent from wake delivery — the `add_message` SQLite write succeeds even when the wake daemon is down, embedding-write contention blocks `add_memory`, or osascript fails for keystroke delivery. This is the path-asymmetry property that makes mailbox the durable coordination substrate during incidents.

---

## Ownership Split

During an active incident, ownership splits across two complementary roles:

- **Local bug owners** — fix specific tickets in their substrate territory. Local-regression batches route naturally to whichever agent has the deepest subsystem familiarity for each fix.
- **One reactivation-gate owner** — coordinates the loop-level validation, runs the cross-harness matrix execution, decides wake-backlog-fence path, and writes the operator-facing reactivation request. This role is singular by design: cross-layer judgment must concentrate, not split, or the swarm risks a "narrow fix landed → reactivate" failure mode.

The reactivation-gate owner is not a permanent role. It is assigned per-incident by the operator (`@tobiu` for canonical) and rotates across the trio as appropriate to subsystem context.

---

## Post-Incident Retrospective Template

After reactivation, the incident closes with a retrospective recorded as a comment on the incident's parent epic (initial canonical example: [#10647](https://github.com/neomjs/neo/issues/10647)). Use this template:

```markdown
## Wake Substrate Incident Retrospective — <date> / <short title>

### Symptom
<what was observed in the operator's harnesses + logs>

### Failed layer
<which of the eight wake-substrate layers broke; cite the specific component>

### Proof
<empirical anchor — log excerpts, PID list, GraphLog row counts, subscription state>

### Fix tickets
<list of #N tickets that closed the regression class>

### Validation evidence
<which #10649 matrix rows ran green; which #10648 gate state transitions occurred; wake-backlog-fence path chosen>

### Recurrence guard
<the test, drift-guard, or protocol change that institutionalizes the lesson — without this, the retrospective is a postmortem-without-substrate, not a guard>
```

The recurrence-guard line is load-bearing. A retrospective that documents what happened but does not link to a test, guard primitive, or protocol-document edit is incomplete; the substrate evolves through the recurrence guards, not through the prose.

Canonical retrospectives for past incidents accumulate as comments on the parent epic [#10647](https://github.com/neomjs/neo/issues/10647) using the template above. The `Operator manual-trip as architectural recovery` trap captured at [#10647](https://github.com/neomjs/neo/issues/10647) epic-review level is the meta-lesson: this protocol's whole purpose is to make the operator's emergency-brake reflex obsolete.

---

## Related Guides

- [Strategic Workflows](./StrategicWorkflows.md) — General agent operational protocols
- [Memory Core](./MemoryCore.md) — Durable mailbox storage substrate (`add_message` / `list_messages`)
- [Swarm Intelligence & Sub-Agents](./SwarmIntelligence.md) — Cross-agent task delegation patterns

## Related Tickets

- [#10647](https://github.com/neomjs/neo/issues/10647) — Wake Incident Safety Tree (parent epic)
- [#10601](https://github.com/neomjs/neo/issues/10601) — Auto-wakeup substrate (grandparent epic)
- [#10648](https://github.com/neomjs/neo/issues/10648) — Wake safety gate / circuit breaker
- [#10649](https://github.com/neomjs/neo/issues/10649) — Cross-harness prompt-landing validation matrix
- [#10650](https://github.com/neomjs/neo/issues/10650) — This protocol's filing ticket
