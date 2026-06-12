---
name: self-repair
description: "Execute autonomous diagnostics, verify MCP server stability, and treat system degradation using tests and memory core forensics. Triggers: [Healthcheck, run health checklist, diagnose system collapse, MCP infrastructure failure, troubleshoot agent OS, system degraded, Sandman handoff verification failure, self-repair, system recovery]"
---
# Autonomous Self-Repair Workflow

If you need to diagnose infrastructure degradation, verify MCP server stability, or troubleshoot a corrupted Agent OS session, you **MUST** immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/self-repair/references/self-repair-protocol.md` before proceeding.
