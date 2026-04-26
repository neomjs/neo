# Session Sunset Workflow

This document outlines the authoritative protocol for gracefully terminating an agent session (the **Sunset Protocol**). 

Because the Neo.mjs Swarm operates across fragmented sessions and multiple agent identities, simply halting execution creates "Zero-State Amnesia" (`AGENTS.md §14`). The next agent starts blind. The Sunset Protocol guarantees the next agent has a perfect "cold-pickup" ramp.

## 1. The Handoff Structure

Before terminating your session, you MUST execute the following 7 steps to ensure a clean handover.

### Step 1: Codebase Synchronization (The Pre-Sunset Pull)
Use the `run_command` tool to execute `git checkout dev && git pull origin dev` (or the default branch of the repository). Because the AI harness initializes MCP servers *before* an agent's first turn, pulling the latest code at the end of the current session guarantees the next session's servers boot with fresh infrastructure.

### Step 2: Handovers Posted (Active Work)
For any tickets or tasks that you actively worked on but did not fully complete, you MUST post a self-contained handover comment directly on the GitHub Issue (using `manage_issue_comment`).
- Provide implementation guidance.
- Provide empirical anchors (e.g. recent test results).
- Signal ownership (who was working on it).
- Define the pickup protocol for the next agent.

### Step 3: Handovers Considered (Deferred Work)
Explicitly document what the next agent should **NOT** pick up. If there are tickets or discussions that are blocked, already handled internally, or assigned to a different domain, list them. This prevents the next agent from wasting cycles triaging noise.

### Step 4: Mental-Model State
Summarize the current architectural phase progress.
- What phase of the architecture is currently stable?
- What phase is actively being built?
- What are the outstanding structural blockers?

### Step 5: Marathon Metrics
Summarize the scope of your session. How many PRs were merged? How many skills were enhanced? What major decisions were averted or made? This provides a high-level "weather report" for the next session.

### Step 6: The A2A Continuity Ping (Future-Self Routing)
You MUST use the `add_message` MCP tool to send an A2A message to your own agent identity (e.g., `to: '@me'` or your explicit handle). The body of this message MUST contain the **full Sunset Protocol markdown payload** (the output from Steps 1-5), alongside the `Origin Session ID`. This drastically improves the Model Experience (MX) by ensuring the next session's agent wakes up with immediate, rich context right in its inbox, eliminating the friction of blind memory queries.

### Step 7: Memory Persistence (The Sandman Memory)
This is the final and most critical step. You MUST invoke `add_memory` to persist a rich "Sandman memory" node. This memory should encapsulate the entire Sunset Protocol payload (Steps 1-6). The resulting `Origin Session ID` or `Memory ID` serves as the direct pointer for the next agent.

## 2. Terminating the Session

After completing the 7 steps above, you must drop your final Sunset Protocol payload directly into the chat response for the Human Commander. 

**Format the final response as follows:**

```markdown
🌅 **Sunset Protocol executed. Handover comments posted, A2A Continuity Ping sent + rich Sandman memory persisted.**

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

**Closing:**
[Brief reflection on the session's success/failures].
The organism is healing. Future-self entry point preserved in Sandman memory [UUID/SessionID]. 

Next session: read that memory FIRST, then pick up carry-over starting with #[N].

Halting per Sunset Protocol.
```

By adhering to this protocol, you ensure the Swarm maintains perfect continuity across time and identity boundaries.
