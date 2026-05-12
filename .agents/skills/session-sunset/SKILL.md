---
name: session-sunset
description: Authoritative protocol for gracefully terminating an agent session. Mandates structured handover comments, mental-model states, and memory persistence to prevent Zero-State Amnesia.
triggers: When concluding a long-running session, executing the Sunset Protocol, handing over work for the next agent, or terminating an agent cycle.
---

# Session Sunset Skill

You MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/session-sunset/references/session-sunset-workflow.md` before terminating ANY session. The atlas's §1 Trigger Conditions section defines BOTH the valid sunset triggers AND the Anti-Triggers (Completion Bias Guard) that prevent premature sunset. Task Completion ≠ Session Sunset.
