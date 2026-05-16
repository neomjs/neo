---
name: memory-mining
description: "Authoritative protocol for querying the Memory Core before diagnosing regressions or proposing non-trivial architectural claims. Prevents re-derivation of prior reasoning by surfacing cross-session, cross-harness context via semantic search. Triggers: Use this skill when (1) the user reports a regression symptom (\"used to work\", \"suddenly broken\", surprise validation failures, schema mismatches, \"additionalProperties\" rejections), OR (2) you are about to propose an architectural claim, roadmap, or comparison against external work where prior sessions may have already mapped the territory."
---

# Memory Mining Skill

If you are diagnosing a regression symptom or about to propose a non-trivial architectural claim, you MUST immediately use the `view_file` tool to read and strictly adhere to `.agents/skills/memory-mining/references/memory-mining-protocol.md` before running `git log`, `grep`, or broader tool exploration. Or, if you already have the payload in context, proceed directly to its directives.
