---
name: sandman-handoff-pre-flight
description: Session-boot pre-flight to evaluate the sandman_handoff.md runtime artifact and halt new-work intake on blocking lane-state.
triggers: Use this skill at the very beginning of every newly booted session — before any other workflow skill, and again as a verification step before opening a new PR or claiming a new ticket — to evaluate `resources/content/sandman_handoff.md` and apply the hard-refusal predicate on blocking `lane-state` values (`AWAITING_REVIEW`, `AWAITING_HUMAN`, or any unknown value per the fail-closed rule).
---

# Sandman Handoff Pre-Flight Skill

If you are at the very beginning of a newly booted session, before executing any workflow skills, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/sandman-handoff-pre-flight/references/sandman-handoff-pre-flight-workflow.md` before proceeding.
