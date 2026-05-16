---
id: 9903
title: RLAIF Trajectory Curation & Whitebox E2E Pre-Flight
state: CLOSED
labels:
  - enhancement
  - ai
assignees:
  - tobiu
createdAt: '2026-04-12T10:10:04Z'
updatedAt: '2026-04-14T05:49:55Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9903'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy:
  - '[x] 9913 fix(ai): Implement JSON recovery/repair in DreamService Tri-Vector Synthesis'
blocking: []
closedAt: '2026-04-13T22:25:23Z'
---
# RLAIF Trajectory Curation & Whitebox E2E Pre-Flight

# RLAIF Trajectory Curation & Whitebox E2E Pre-Flight (formerly `executeNLActionDigest`)

> [!CAUTION]
> **ARCHITECTURAL PIVOT**: This ticket was originally scoped to implement `executeNLActionDigest` inside the `DreamService.mjs` daemon to autonomously generate `.spec.mjs` Playwright scaffolding. That approach was identified as a critical anti-pattern producing fragile, low-ROI test noise. 
> 
> The architecture has officially pivoted from **"Test Generation"** to **"RLAIF Trajectory Curation"**.

### Context & Motivation

The `nl_action_log` captured during Frontier agent (e.g., Gemini 3.1 Pro / Claude Opus 4.6) interactions via the Neural Link represents highly valuable "Demonstrations of Intelligence". Instead of stuffing these sequences blindly into Playwright test scaffolding, we will stockpile these successful component state interactions as synthetic training data to feed future SLM fine-tuning pipelines (SFT/DPO for Gemma 4).

### Architectural Requirements

1. **The Telemetry Script (No MCP Bloat)**: Instead of a daemon, the telemetry must be queried interactively via `node ai/scripts/analyzeNlTelemetry.mjs <sessionId>`. This protects the 100-tool MCP limit while allowing Frontier models to compress their own Action Logs.
2. **RLAIF Data Persistence**: Synthesized interaction sequences must be formatted functionally into `.jsonl` and permanently stockpiled into `.neo-ai-data/datasets/rlaif/trajectories.jsonl`.
3. **Whitebox E2E Pre-Flight**: Establish the `.agent/skills/whitebox-e2e` Progressive Disclosure skill to mandate that Frontier agents *always* introspect the Neural Link VDOM state *before* writing Playwright selectors.

### References
- **Origin Session ID (Pivot)**: `f191cbb2-133b-43ac-bd7a-a2e85ea1fd95` (Agents: use `get_session_memories` to pull context on why test generation was abandoned).
- **Related PR**: #9902

## Timeline

- 2026-04-12T10:10:05Z @tobiu added the `enhancement` label
- 2026-04-12T10:10:05Z @tobiu added the `ai` label
- 2026-04-12T11:40:04Z @tobiu marked this issue as being blocked by #9913
- 2026-04-13T21:35:39Z @tobiu changed title from **Implement `executeNLActionDigest` in DreamService for Neural Link Data Synthesis** to **RLAIF Trajectory Curation & Whitebox E2E Pre-Flight**
- 2026-04-13T21:37:30Z @tobiu assigned to @tobiu
- 2026-04-13T22:13:37Z @tobiu referenced in commit `b53af5b` - "feat(ai): Implement Neural Link telemetry extraction script and unit test (#9903)"
- 2026-04-13T22:13:37Z @tobiu referenced in commit `ccacb6a` - "docs: Scaffold whitebox-e2e Progressive Disclosure skill (#9903)"
- 2026-04-13T22:13:37Z @tobiu referenced in commit `afebeae` - "docs: finalized RLAIF documentation mappings and fixed namespace debt (#9903)"
- 2026-04-13T22:13:55Z @tobiu cross-referenced by PR #9990
- 2026-04-13T22:18:33Z @tobiu referenced in commit `ea8a0a0` - "test(ai): Fix CodeQL uncontrolled absolute path execution in telemetry tests (#9903)"
- 2026-04-13T22:25:22Z @tobiu referenced in commit `f3b68d7` - "feat/docs: RLAIF Trajectory Curation & Whitebox E2E Pre-Flight (#9903) (#9990)

* feat(ai): Implement Neural Link telemetry extraction script and unit test (#9903)

* docs: Scaffold whitebox-e2e Progressive Disclosure skill (#9903)

* docs: finalized RLAIF documentation mappings and fixed namespace debt (#9903)

* test(ai): Fix CodeQL uncontrolled absolute path execution in telemetry tests (#9903)"
- 2026-04-13T22:25:23Z @tobiu closed this issue
- 2026-04-20T19:14:36Z @tobiu cross-referenced by #10132
- 2026-04-20T19:21:41Z @tobiu cross-referenced by PR #10133
- 2026-04-20T19:41:06Z @tobiu referenced in commit `d289889` - "chore(ai): retire manage_database_backup MCP tools (#10132) (#10133)

* chore(ai): retire manage_database_backup MCP tools (#10132)

Follow-up to #10131. Reclaims one MCP tool slot by retiring the pre-existing
MC `manage_database_backup` tool and reverting the KB `/db/backup/manage`
openapi surface added in #10131 (which was never wired in toolService.mjs
serviceMapping, so it was yaml-only — not an MCP tool).

Script-over-tool per #9903 precedent: `npm run ai:backup` covers all five
persistent subsystems atomically, strictly more capable than the MCP tool
ever was. Service methods remain callable via `ai/services.mjs` SDK —
makeSafe no-match passthrough forwards raw args, so backup.mjs continues
with zero functional regression.

Changes:
- Removed MC `/db/backup/manage` openapi path + `BackupActionResponse` schema
- Removed MC `manage_database_backup` from toolService.mjs serviceMapping
- Removed KB `/db/backup/manage` openapi path + `BackupActionResponse` schema
- Updated KB DatabaseService class + method JSDoc (no longer references openapi
  registration / Zod wrapping)
- Renamed KB backup spec test "Zod validation boundary" -> "dispatcher layer"

All 11 affected Playwright specs pass under --workers=1.

Diagnostic note: the pre-existing `McpServerToolLimits.spec.mjs` failure is
unrelated to this work — `manage_database` (the Chroma lifecycle tool) has a
1161-char description, not `manage_database_backup` (which was short).
Deferred to the getFullDescription exploration.

* chore(ai): serialize backup specs for local DX (#10132)

Polish commit addressing the parallel-worker race flagged in #10133's
self-review. Three affected specs mutate singleton collection accessors
(KB_ChromaManager.getKnowledgeBaseCollection, Memory_StorageRouter.get{Memory,
Summary}Collection) via beforeAll/afterAll. Under local multi-worker runs
(playwright default) this occasionally surfaces as `TypeError: Cannot set
properties of undefined` during afterAll cleanup.

Adding `test.describe.configure({mode: 'serial'})` at the top of each
affected file forces in-file serialization. CI already uses `workers: 1`
(see test/playwright/playwright.config.unit.mjs), so this is a local-DX
safeguard only — it doesn't change CI behavior.

Verified: 11 passed + 1 pre-existing failure (McpServerToolLimits.spec.mjs's
manage_database 1161-char description, unrelated to this work)."

