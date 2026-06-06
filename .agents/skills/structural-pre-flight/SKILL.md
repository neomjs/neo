---
name: structural-pre-flight
description: "Authoritative pre-implementation discipline gate that fires when a new `.mjs` file is about to be authored. Stage 0 mechanical trigger; Stage 1 fast-path (sibling-file-lift pattern match) for matched patterns OR full Pre-Flight (ArchitectureOverview.md + ADR consultation + chief-architect framing) for novel directory choices. Closes the 0th-level discipline gap empirically demonstrated by `ai/daemons/wake/daemon.mjs` (originally misplaced in `ai/scripts/` as `bridge-daemon.mjs`) and `orchestrator-daemon.mjs` (PR #11008 same-class miss). Triggers: Use this skill before authoring or relocating any new `.mjs` file. Fires from `ticket-create` Stage 3 (Substrate), `ticket-intake` validation, `epic-review` Stage 3, and any direct authoring path. Sibling pattern match → 30-second fast-path; novel directory choice → full structural pre-flight before the file is written."
---

# Structural Pre-Flight Skill

If you are about to author or relocate a `.mjs` file (new module, daemon, service, script, helper, etc.), you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/structural-pre-flight/references/structural-pre-flight-workflow.md` before touching the filesystem.

The skill has two stages: a 30-second sibling-pattern fast-path AND a full Pre-Flight for novel directory choices. Always emit the explicit Pre-Flight reasoning-statement so future graph-traversal can audit the architectural choice.
