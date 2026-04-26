# Session Sunset Workflow

This document outlines the authoritative protocol for gracefully terminating an agent session (the **Sunset Protocol**). 

Because the Neo.mjs Swarm operates across fragmented sessions and multiple agent identities, simply halting execution creates "Zero-State Amnesia" (`AGENTS.md §14`). The next agent starts blind. The Sunset Protocol guarantees the next agent has a perfect "cold-pickup" ramp.

## 1. Trigger Conditions: Turn vs. Session

To an LLM, yielding a prompt resolution feels like a "termination," but to a Human Commander, it is merely a **Turn** within a longer continuous **Session**. 

You are strictly **FORBIDDEN** from executing the Sunset Protocol simply because you finished a prompt and yielded control back to the human. You MUST only execute the Sunset Protocol when a true **Session Boundary** is reached.

A true Session Boundary is defined by:
1. **Context Window Exhaustion:** You are approaching the token limit of your model (e.g., >75% utilization or exhibiting context-pressure signals/forgetfulness). Avoid hardcoding specific token counts as models evolve.
2. **Macro-Semantic Pivot:** The human explicitly shifts focus to a completely new domain, epic, or architectural phase (e.g., switching from Database Layer substrate work to UI Framework component design), requiring a clean slate. *Asymmetry Tiebreaker: The cost of a premature sunset is greater than a late sunset; when in doubt, lean conservative and keep the session open.*
3. **Explicit Human Directive:** The Human Commander explicitly instructs you to terminate the session (e.g., "let's wrap", "time to sunset", or `/sunset`).
4. **Proactive Agent Recommendation:** You recognize a natural, logical break point in the work stream and explicitly recommend sunsetting to the human.

If none of these conditions are met, do **NOT** sunset. Simply output your response and wait for the next turn.
## 2. The Handoff Structure

Before terminating your session, you MUST execute the following 7 steps to ensure a clean handover.

### Step 1: Codebase Synchronization (The Pre-Sunset Pull)
Use the `run_command` tool to synchronize the codebase, but you MUST respect harness-isolation logic:
- **Shared Checkout (Antigravity/Gemini):** Execute `git checkout dev && git pull origin dev`. Because the AI harness initializes MCP servers *before* an agent's first turn, pulling the latest code at the end of the current session guarantees the next session's servers boot with fresh infrastructure.
- **Isolated Worktree (Claude Code):** Do NOT checkout `dev` (which would conflict with the main checkout). Instead, ensure your current PR branch is fully committed and pushed (`git push origin HEAD`). The next agent session will either resume this worktree or bootstrap a new one from the main checkout's updated `dev`.
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

### Step 6: The A2A Continuity Ping & Reward Signal (Future-Self Routing)
You MUST use the `add_message` MCP tool to send an A2A message to your own agent identity (e.g., `to: '@me'` or your explicit handle). The body of this message MUST contain the **full Sunset Protocol markdown payload** (the output from Steps 1-5), alongside the `Origin Session ID`. 

Crucially, from an "LLM Psychology" perspective, this message must include a **Conceptual Priming / Reward Signal**. If you formulated new architectural concepts or achieved a major milestone, summarize the *actual content and value* of that breakthrough in the ping. Reading this high-density, successful content acts as a mathematical "dopamine hit" for your future self—it primes the next session's token probabilities for high-agency, expert-level continuity. This drastically improves the Model Experience (MX) by ensuring the agent wakes up not just with tasks, but with immediate, rich, "exciting" context.

### Step 7: Memory Persistence (The Sandman Memory)
This is the final and most critical step. You MUST invoke `add_memory` to persist a rich "Sandman memory" node. This memory should encapsulate the entire Sunset Protocol payload (Steps 1-6). The resulting `Origin Session ID` or `Memory ID` serves as the direct pointer for the next agent.

## 3. Terminating the Session

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

**Conceptual Priming & Reward Signal:**
- [Summarize the biggest breakthrough or conceptual definition achieved this session. E.g., "We successfully codified MX (Model Experience)—the principle that substrate evolution is driven by model-friction. This moves us one step closer to ANI."]

**Closing:**
[Brief reflection on the session's success/failures].
The organism is healing. Future-self entry point preserved in Sandman memory [UUID/SessionID]. 

Next session: read that memory FIRST, then pick up carry-over starting with #[N].

Halting per Sunset Protocol.
```

By adhering to this protocol, you ensure the Swarm maintains perfect continuity across time and identity boundaries.
