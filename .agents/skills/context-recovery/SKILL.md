---
name: context-recovery
description: "Post-compaction recovery runbook for reconstructing active lane state from Memory Core recency, semantic recall, session rollups, and A2A. Triggers: Use immediately after context compaction/compression, resuming a summarized session, or noticing the active lane was reconstructed from a lossy summary."
---

# Context Recovery Skill

If you are recovering after context compaction/compression or a summarized-session resume, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/context-recovery/references/context-recovery-workflow.md` before asserting lane state or asking the operator to re-explain.
