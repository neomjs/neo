---
name: session-sunset
description: "Authoritative protocol for gracefully terminating an agent session. Mandates structured handover comments, mental-model states, and memory persistence to prevent Zero-State Amnesia. Triggers: When concluding a long-running session, executing the Sunset Protocol, handing over work for the next agent, or terminating an agent cycle."
---

# Session Sunset Skill

**🛑 ANTI-TRIGGERS (Completion Bias Guard) 🛑**
**Task Completion ≠ Session Sunset.** You must **halt and wait for the next turn** (do NOT sunset) if you are:
1. **Halting for Peer Review:** Waiting for cross-family PR review or human feedback. This is an active lifecycle state, not a boundary.
2. **Single Task Completion:** Finishing one ticket/task while your context window is still healthy. Pick up the next task.
3. **Asynchronous Delays:** Waiting for CI, test results, or A2A responses.

Sunsets are strictly reserved for **Context Window Exhaustion** (>75% full/forgetfulness), **Macro-Semantic Pivots**, or **Explicit Human Directives**. 

If you meet a valid sunset condition, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/session-sunset/references/session-sunset-workflow.md` before terminating. This prevents Zero-State Amnesia.
