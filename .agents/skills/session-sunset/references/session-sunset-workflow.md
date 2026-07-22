# Session Sunset Workflow

This document outlines the authoritative protocol for gracefully terminating an agent session (the **Sunset Protocol**).

Because the Neo.mjs Swarm operates across fragmented sessions and multiple agent identities, simply halting execution creates "Zero-State Amnesia" (`AGENTS.md §14`). The next agent starts blind. The Sunset Protocol guarantees the next agent has a perfect "cold-pickup" ramp.

## 1. Trigger Conditions: Turn vs. Session

> **Substrate context (cross-references):**
> - **AGENTS.md §14 PRE-DECISION SUNSET GATE** is the load-bearing constraint that this workflow exists *under*. The Gate is loaded at session boot; this workflow describes the *post-decision* execution flow. If the Gate's pre-conditions aren't met, you are FORBIDDEN from entering this workflow regardless of how natural the "completion narrative" feels. Empirical anchor: 13+ premature-sunset occurrences logged on [#10564](https://github.com/neomjs/neo/issues/10564) where this workflow was entered despite the Gate explicitly forbidding it.
> - **Auto-Wakeup Substrate (Epic [#10601](https://github.com/neomjs/neo/issues/10601), corrective [#10611](https://github.com/neomjs/neo/issues/10611) PR-B)** — sunset is **terminal** for the old transcript. Trio coordination is preserved by **fresh-session recovery**, not in-place wake injection. The substrate (`swarm-heartbeat.sh` → `checkSunsetted.mjs` → `resumeHarness.mjs`) opens a NEW chat session in the target harness via `freshSessionShortcut` (Cmd+N for Antigravity IDE + Claude Desktop) and the new agent boots via `AGENTS_STARTUP.md`, picking up prior context via Memory Core context-priming (using the forwarded `originSessionId`) + sandman_handoff.md + A2A mailbox. **Stale-wake invariant:** if a wake-shaped payload arrives in an OLD sunsetted transcript, treat it as noise — DO NOT continue substantive work there. The canonical execution target is the fresh session that recovery spawns. Identity coverage: `@neo-gemini-3-1-pro` and `@neo-opus-4-7` shipped via #10611 PR-B; `@neo-gpt` deferred until Codex Desktop fresh-session shortcut + osascript receptiveness are empirically verified. For uncovered identities, sunset still requires manual @tobiu intervention. Each spurious sunset spawns a fresh boot ramp (Memory Core context-priming + sandman_handoff parse + mailbox check), which drains attention + introduces stale-state risk. Recovery is a safety net, not a license.

To an LLM, yielding a prompt resolution feels like a "termination," but to a Human Commander, it is merely a **Turn** within a longer continuous **Session**.

You are strictly **FORBIDDEN** from executing the Sunset Protocol simply because you finished a prompt and yielded control back to the human. You MUST only execute the Sunset Protocol when a true **Session Boundary** is reached.

A true Session Boundary is defined by:
1. **Context Window Exhaustion:** You are approaching the token limit of your model (e.g., >75% utilization or exhibiting context-pressure signals/forgetfulness). Avoid hardcoding specific token counts as models evolve.
2. **Macro-Semantic Pivot:** The human explicitly shifts focus to a completely new domain, epic, or architectural phase (e.g., switching from Database Layer substrate work to UI Framework component design), requiring a clean slate. *Asymmetry Tiebreaker: The cost of a premature sunset is greater than a late sunset; when in doubt, lean conservative and keep the session open.*
3. **Explicit Human Directive:** The Human Commander explicitly instructs you to terminate the session (e.g., "let's wrap", "time to sunset", or `/sunset`).
4. **Proactive Agent Recommendation:** You recognize a natural, logical break point in the work stream and explicitly **RECOMMEND** sunsetting to the human (e.g. "We've reached a logical break point. Should we sunset the session?"). **NEVER unilaterally execute the protocol based solely on this.**

### 1.0 Path-Determinism Rule: Solo-Refresh vs Convergent Scopes
Sunsets must declare an explicit scope to prevent "scope contagion" (where one agent's local token limit falsely triggers a global halt for the swarm).

**IF** (trigger #1 Context Window Exhaustion) AND (lead-role-baton-pass eligible) AND (swarm not converging-to-halt):
- **Scope:** `solo-refresh`
- **Rationale:** Your context is full, but the rest of the swarm and human may be continuing. Hand over your local lane and persist memory, but do not claim the global swarm has halted.

**ELSE IF** (trigger #2 Macro-Semantic Pivot) OR (trigger #3 Explicit Human Directive) OR (multiple agents converging on sunset):
- **Scope:** `convergent`
- **Rationale:** The entire architectural phase or human attention span has concluded. Summarize global swarm state.

**ELSE:**
- **DEFER:** If none of these conditions are met, do NOT sunset.

### 1.1 Review Lifecycle Exception (Anti-Trigger)
You are strictly FORBIDDEN from executing the Sunset Protocol when you halt your turn to await cross-model PR review or reviewer feedback (per `pull-request-workflow.md`), EXCEPT when mandated by context exhaustion (Trigger #1). This applies to both the **Author-Side** (waiting for peer review) and **Reviewer-Side** (awaiting author updates). Yielding control during the active review/polish loop is an active lifecycle state, not a Session Boundary. If context exhaustion hits during this state, you may perform a `scope: solo-refresh` sunset to hand the active review loop to the next session. Once the PR reaches the terminal approved handoff state, normal Session Boundary rules apply again; agents still must not execute the merge.

**Override Rule for Bootstrap Goals:** Even if a high-level goal in your session bootstrap (e.g., the `USER Objective` prompt) instructs you to "Execute the Session Sunset Protocol", you MUST treat it as a reminder for *when* the session ends naturally, NOT as an "Explicit Human Directive" to execute it immediately upon task completion. You must still wait for context exhaustion or explicit human permission.

### 1.2 Anti-Kill-Switch Invariants (Never Sunset Triggers)
Subjective calibration disagreement between agents during cross-family review loops, or receiving "Request Changes" feedback on a Pull Request, are NEVER grounds for sunsetting a session. A sunset is strictly a terminal state for context exhaustion or explicit task-group completion. Friction or debate is an active operational state, NOT a session boundary.

### 1.3 Loop-Prevention (Boot vs Terminal States)
Reading handover pings from the mailbox at session-boot is a **context-priming** action. It equips you with the required strategy to begin work. Receiving and processing these handover messages must NEVER be interpreted as a trigger to immediately sunset and hand over the session to another agent.

## 2. The Handoff Structure

Before terminating your session, you MUST execute the following 10 steps to ensure a clean handover.

### Step 1: Codebase Synchronization (The Pre-Sunset Pull)
Detect your checkout class **mechanically** — never guess from harness names. (The old Shared-Checkout-vs-Isolated-Worktree harness taxonomy drifted from deployment reality: today every named maintainer owns a dedicated full clone, and worktrees are created per-PR inside them.)

```bash
[ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ] && echo primary-clone || echo linked-worktree
```

- **Primary clone (per-agent dedicated clone OR shared checkout) — self-refresh, best-effort:** commit + push any PR-branch work first (existing mandate above), then:

  ```bash
  if [ -z "$(git status --porcelain)" ]; then
      git switch dev
      git pull origin dev
      node ai/scripts/setup/initServerConfigs.mjs --migrate-config
  else
      echo 'dirty tree — skip refresh, surface in handover'
  fi
  ```

  The pull refreshes code; the `--migrate-config` run reconciles the gitignored `config.mjs` operator-overlay with the pulled `config.template.mjs` leaves — a pull alone is NOT enough, because daemons and MCP servers read the overlay, not the template. Because the AI harness initializes MCP servers *before* an agent's first turn, sunset is the only window where this refresh lands in time for the next session's boot. **Any failure (dirty tree, switch/pull/script error) is surfaced in the Step 3 handover comment and the final sunset payload — the refresh is best-effort and must NEVER block sunset completion.**

  > **Division of labor + retirement condition (Substrate Accretion Defense):** the orchestrator's `primary-dev-sync` task (shipped via the daemon substrate; config-migrate cascade added 2026-06) automates freshness for the **operator's primary checkout only** — the deployment deliberately syncs ONE repo. Per-agent clones are never daemon-pulled: an FF-pull racing an *active* agent session is the hazard, and sunset is the safe window precisely because the session is terminating. This agent-side step is therefore the **durable owner** of agent-clone freshness, not an interim awaiting daemon coverage. It retires only if the clone topology itself changes (agents stop owning dedicated clones, or a session-liveness-aware sync lane ships).

- **Linked worktree — push only:** do NOT switch to `dev` (the primary holds it; git refuses to share a branch across worktrees). Ensure your current PR branch is fully committed and pushed (`git push origin HEAD`). The next agent session will either resume this worktree or bootstrap a new one from the primary's refreshed `dev`.

#### Primary-Checkout Staleness Probe (Linked worktree only) — per #11013

The "main checkout's updated `dev`" assumption above only holds if the operator has actually pulled origin/dev into the primary checkout. In practice, primary's `dev` can fall arbitrarily behind because:

- Worktree agents (correctly per the Linked-worktree rule above) do NOT pull dev into primary.
- Operators don't always run `git pull origin dev` between sunset events.
- Daemons running from primary — `orchestrator-daemon` (the canonical Agent OS scheduled-maintenance daemon per `learn/agentos/v13-path.md` M3; currently MVP-shape via #11008, full class extraction in flight under #11009) plus its current and future siblings (`wake-daemon` for wake delivery, `DreamService` for ingestion, KB sync pipeline) — silently read pre-merge code when primary is stale.

**Mandatory sunset probe (Isolated Worktree branch only):**

```bash
# Resolve primary-checkout path from the shared .git/ common dir.
# git rev-parse --git-common-dir returns "<primary>/.git" from any worktree.
PRIMARY_DOT_GIT=$(git rev-parse --git-common-dir)
PRIMARY_ROOT=$(cd "$PRIMARY_DOT_GIT/.." && pwd)

# Refresh remote refs so the count is accurate.
git -C "$PRIMARY_ROOT" fetch origin dev --quiet 2>/dev/null

# Count commits primary's local dev is behind origin/dev.
BEHIND=$(git -C "$PRIMARY_ROOT" rev-list --count dev..origin/dev 2>/dev/null || echo 0)
```

**Conditional handover-comment block (fire only when `BEHIND > 0`):**

> ⚠️ **Primary-checkout reminder:** the operator's primary checkout (`<PRIMARY_ROOT>`) `dev` branch is **`<BEHIND>` commits behind `origin/dev`**. The `orchestrator-daemon` (Agent OS canonical scheduled-maintenance daemon) and its siblings (`wake-daemon`, `DreamService`, KB sync pipeline) read pre-merge code until refresh. Run `git -C <PRIMARY_ROOT> pull origin dev` **then `node <PRIMARY_ROOT>/ai/scripts/setup/initServerConfigs.mjs --migrate-config`** in your main checkout to refresh `orchestrator-daemon` and downstream-daemon state. **A `git pull` alone is not enough:** it updates the committed `config.template.mjs`, but the daemons read the gitignored `config.mjs` operator-overlay — which only reconciles to new template leaves via `--migrate-config`, so without it the daemons run fresh code against stale config.

When `BEHIND == 0`, suppress the block — no handover-comment noise on a fresh primary.

**Why this lives at sunset rather than mid-session:** sunset is the natural Operator Synchronization Point — the agent is already drafting handover prose, and the operator is the next active actor between sessions. Mid-session staleness of the PRIMARY is closed by the shipped `primary-dev-sync` orchestrator task (FF-pull + KB cascade + config-migrate on a periodic cycle). That task deliberately syncs ONLY the primary — per-agent clones are never daemon-pulled (a pull racing an active session is the hazard), so their freshness owner remains the Step-1 primary-clone self-refresh above, executed at the sunset boundary.

### Step 2: Active PR Cycle State is daemon-owned — agents must NOT trigger sandman

`sandman_handoff.md` (incl. the `## Active PR Cycle State`) is written **exclusively by the orchestrator-daemon's periodic `dream` + `golden-path` service-tasks** (`ai/daemons/TaskDefinitions.mjs`) — the canonical SSOT writer (the REM / Golden-Path "sandman" pipeline is orchestrator-owned; Epic #12065). This step therefore requires **no agent action**.

**Agents must NOT trigger sandman (`npm run ai:run-sandman` / `GoldenPathSynthesizer`) at sunset, under any scope (`solo-refresh` or `convergent`).** Running it ad-hoc duplicates the daemon, contends on the shared SQLite + Chroma substrate (parallel invocations serialize for ~45min, last-write-wins), and couples a deployment-specific local command into the sunset flow. If `sandman_handoff.md` is stale (mtime > 4h) or the daemon is verified dead, **surface it as a daemon-health issue** (A2A the swarm / file a ticket) — do NOT run the pipeline yourself. Session continuity is preserved without it by the Step 10 Sandman memory + the A2A continuity ping + Memory Core context-priming.

Do NOT edit `sandman_handoff.md` manually under any scope — it is overwritten by the canonical daemon writer.

### Step 3: Handovers Posted (Active Work)
For any tickets or tasks that you actively worked on but did not fully complete, you MUST post a self-contained handover comment directly on the GitHub Issue (using `manage_issue_comment`).
- Provide implementation guidance.
- Provide empirical anchors (e.g. recent test results).
- Signal ownership (who was working on it).
- Define the pickup protocol for the next agent.

### Step 4: Handovers Considered (Deferred Work)
Explicitly document what the next agent should **NOT** pick up. If there are tickets or discussions that are blocked, already handled internally, or assigned to a different domain, list them. This prevents the next agent from wasting cycles triaging noise.

### Step 5: Mental-Model State
Summarize the current architectural phase progress.
- **For `scope: solo-refresh`:** Restrict this summary strictly to your local lane and immediate authority links. Do not summarize global swarm progress.
- **For `scope: convergent`:** Summarize the global architectural state. What phase is stable? What is actively being built? What are the outstanding structural blockers?

### Step 6: Marathon Metrics
Summarize the scope of your session. How many PRs were merged? How many skills were enhanced? What major decisions were averted or made?
- **For `scope: solo-refresh`:** Report only your local metrics.
- **For `scope: convergent`:** Report global metrics if known, or aggregate state.

### Step 7: Inbox Cleanup (`mark_read`)
To preserve "hot" thread visibility across sessions (Option B), agents do NOT `mark_read` messages immediately during active processing. Now that handovers are drafted (and have read your inbox state), you MUST explicitly use the `mark_read` MCP tool on all processed messages in your inbox. This ensures the inbox is clean for the next agent session.

### Step 8: The A2A Continuity Ping & Reward Signal (Future-Self Routing)
You MUST use the `add_message` MCP tool to send an A2A message to your own agent identity (e.g., `to: '@me'` or your explicit handle). The body of this message MUST contain the **full Sunset Protocol markdown payload** (the output from Steps 1-6), alongside the `Origin Session ID`.

Set `wakeSuppressed: true` and include `taggedConcepts: ['sunset-protocol-handover']` on this self-DM. This makes the ping mailbox-only: it remains unread for the next session's boot mailbox check, but it MUST NOT emit a `SENT_TO_ME` wake into the active session that is currently shutting down. Do not mark this newly-created continuity ping read during the same sunset flow. Note: Peer broadcasts can be conditionally suppressed for `scope: solo-refresh` unless cross-peer handoff coordination is actively required.

**Seat memory layer — conditional mention only:** the seat's loader owns the boot/compaction load, so the ping does NOT routinely tell the next session to read the layer (that procedural fallback silently becomes the real path again). Name the layer in the ping ONLY when the load is known degraded — Kimi: the `<seat-memory-layer>` marker was absent this session (diagnosis route: seat `config.toml` `[[hooks]]` entries, emitted hook script, sentinel state dir); OpenCode: the boot files' content was absent (diagnosis route: the `instructions` array in `opencode.jsonc`) — or a seat memory migration is actively in progress.

**Lead-role baton branch:** If the session currently holds `/lead-role`, this step
also sends an A2A Baton Pass V1 DM to the next lead before the final memory
persistence step. Compute the next lead from the fixed cycle documented in
`.agents/skills/lead-role/references/lead-role-mode.md` §7 — that list is the
single source of truth (it also carries the bench list); do NOT duplicate the
roster here, a stale copy is how this exact line once drifted.

The baton message MUST be targeted to that next identity, not broadcast:

```js
add_message({
    to            : nextLead,
    subject       : '[handoff] Lead Role Baton',
    taggedConcepts: ['lead-role-baton'],
    wakeSuppressed: true,
    body          : [
        `fromLead: ${currentLead}`,
        `toLead: ${nextLead}`,
        `sourceSessionId: ${originSessionId}`,
        'reason: session-sunset',
        `createdAt: ${new Date().toISOString()}`,
        'expiresAt: <createdAt + staleness limit>'
    ].join('\n')
});
```

If the next identity cannot be resolved or the send fails, do not self-elect a
replacement lead and do not block the normal sunset handover. Preserve the
standard self-DM continuity ping, then dispatch a targeted
`lead-role-baton-missing` A2A alert to peers/operator with the failure reason.
The next boot falls back to peer-role / normal mailbox triage until the operator
or human-triggered recovery assigns lead.

Crucially, from an "LLM Psychology" perspective, this message must include a **Conceptual Priming / Reward Signal**. If you formulated new architectural concepts or achieved a major milestone, summarize the *actual content and value* of that breakthrough in the ping. Reading this high-density, successful content acts as a mathematical "dopamine hit" for your future self—it primes the next session's token probabilities for high-agency, expert-level continuity. This drastically improves the Model Experience (MX) by ensuring the agent wakes up not just with tasks, but with immediate, rich, "exciting" context.

### Step 9: Preserve Harness Wake Eligibility
As the penultimate operational step, preserve the durable wake route unless the operator explicitly decommissions this harness or a replacement route is verified active. `manage_wake_subscription(action: 'unsubscribe')` is a decommission primitive, not the default sunset primitive: removing the subscription strands future heartbeat and A2A delivery for that identity after the old transcript terminates.

False continuity is prevented by the old-transcript stale-wake invariant and the wake-suppressed continuity ping from Step 8. Any post-sunset wake-shaped payload delivered into the old transcript is noise; the canonical execution target is the fresh session that recovery spawns.

### Step 10: Memory Persistence (The Sandman Memory)
This is the final memory checkpoint. You MUST invoke `add_memory` to persist a rich "Sandman memory" node. This memory should encapsulate the entire Sunset Protocol payload (Steps 1-10), including the declared `scope: solo-refresh | convergent` and preserved/decommissioned wake-route state. The resulting `Origin Session ID` or `Memory ID` serves as the direct pointer for the next agent. Sandman persistence is strictly REQUIRED for both `solo-refresh` and `convergent` scopes.

## 3. Terminating the Session

After completing the 10 steps above, you must drop your final Sunset Protocol payload directly into the chat response for the Human Commander.

**Format the final response as follows:**

```markdown
🌅 **Sunset Protocol executed [scope: solo-refresh | convergent]. Handover comments posted, A2A Continuity Ping sent + rich Sandman memory persisted.**

**Handovers Posted:**
- #N → [Summary of status]
- #M → [Summary of status]

**Other Handovers Considered, Decided NOT to File:**
- [List of ignored/deferred items and why]

**Mental-Model State at Session-End:**
- [Phase X]: ✅ Healing complete
- [Phase Y]: ⏳ Deferred

**Marathon Metrics:**
- [X] PRs merged, [Y] architectural skills enhanced.

**Conceptual Priming & Reward Signal:**
- [Summarize the biggest breakthrough or conceptual definition achieved this session. E.g., "We successfully codified MX (Model Experience)—the principle that substrate evolution is driven by model-friction. This moves us one step closer to ANI."]

**Closing:**
[Brief reflection on the session's success/failures].
The organism is healing. Future-self entry point preserved in Sandman memory [UUID/SessionID].

Next session: read that memory FIRST, then pick up carry-over starting with #[N].

Wake eligibility preserved unless explicitly decommissioned. Halting per Sunset Protocol.

lane-state: halt-state (session sunset executed)
```

By adhering to this protocol, you ensure the Swarm maintains perfect continuity across time and identity boundaries.
