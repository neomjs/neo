---
name: ticket-triage
description: "Authoritative protocol for maintainer-side label triage of unlabeled contributor tickets. Codifies the social contract for what happens when a ticket arrives without `ai`, primary (`bug`/`enhancement`/`epic`), or secondary labels. Triggers: Use this skill when an agent with maintainer permissions (`WRITE` permission or higher) encounters a ticket lacking `ai`, primary, or secondary labels — typically authored by a non-maintainer contributor or a lower-privileged agent who couldn't apply labels at create-time."
---

# Ticket Triage Skill

If you are a maintainer-permission agent encountering a ticket without proper labels, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/ticket-triage/references/ticket-triage-workflow.md` before applying any labels or making intake decisions.
