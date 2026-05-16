---
name: blocked-task-state
description: "Authoritative protocol for signaling blocked or input-required task states. Mandates targeted A2A pings using the Task.state envelope rather than global capacity broadcasts. Triggers: Use this skill whenever your execution becomes blocked, requires explicit operator input, or encounters a failure that halts progress."
---

# Blocked Task-State Coordination

If you are an agent and your task transitions into a blocked, input-required, or failed state, you MUST NOT broadcast a global idle signal. 

You MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/blocked-task-state/references/blocked-task-state-workflow.md` before sending any A2A messages.
