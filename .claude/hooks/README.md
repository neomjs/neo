# Claude Code Hooks

Harness-level automation for the Neo Agent OS, wired through Claude Code's
[hook system](https://code.claude.com/docs/en/hooks.md).

## `persist-memory.mjs` — auto-persist turn memories (#10063)

### Why

`AGENTS.md §memory_core_protocol` mandates an `add_memory` call at the end of **every** turn. Under
cognitive load this is forgotten — empirically, session `f018be49-…` ran ~25 turns with **zero** manual
saves, breaking every downstream `query_raw_memories(sessionId)` self-detection (e.g. `pr-review`'s
own-session check returned 0 matches and needed manual override).

"Always do X at end of turn" is a **harness** responsibility, not an agent-discipline one. Claude Code's
`Stop` hook fires after each turn — wiring it to the Memory Core makes per-turn persistence deterministic
and removes the human/agent from the loop.

### How it works

```
turn ends → Claude Code runs the Stop hook → pipes {session_id, transcript_path, …} on stdin
          → persist-memory.mjs tails the transcript JSONL, extracts the last turn
          → imports ai/services.mjs (direct SDK — no MCP subprocess, no HTTP)
          → await Memory_LifecycleService.ready(); Memory_Service.addMemory({…})
```

**Fail-soft by contract:** every error path (chroma down, malformed transcript, services cold-start
failure) logs to `stderr` and `exit(0)`. A persistence failure must never block the user's next turn.
Wired `async: true` so the ~500 ms–1 s `services.mjs` cold-start stays off the interactive path.

### Transcript → `add_memory` mapping (Option B)

Claude Code has no discrete "thought" field, so the turn is projected onto `add_memory`'s
`{prompt, thought, response}` triad. **Option B** (resolved at #10063 ticket-intake) prefers
extended-thinking over plain narration:

| `add_memory` field | Source |
| --- | --- |
| `prompt` | The last **real** user prompt (string content, or joined `text` blocks). |
| `thought` | Concatenated `thinking` blocks across the turn; **fallback** → pre-response narration text; **final fallback** → an explicit placeholder (the field is schema-required). |
| `response` | The final user-facing `text` block of the turn. |
| `toolsUsed` | Deduped `tool_use` block names (names only — never arguments/payloads). |
| `amountToolCalls` | Total `tool_use` block count. |
| `sessionId` | From the hook stdin `session_id` (groups the turn under the session). |
| `model` | The assistant entry's `message.model` (optional). |

**Why Option B over the alternatives:** **A** loses extended-thinking blocks (the richest reasoning
signal — verified present in real transcripts). **C** uses an empty `thought`, which would require a
memory-core schema change (`thought` is required) — strictly more coupling for less signal.

### The real transcript is messier than "tail = last turn"

A naive parser that reads the final JSONL entry fails. Real Claude Code transcripts interleave **8+
entry types** — `user`, `assistant`, plus `queue-operation`, `last-prompt`, `ai-title`, `pr-link`,
`attachment`, `system` bookkeeping that routinely **trails** the final assistant text. And a single turn
spans **many** assistant entries (`text`/`thinking` → `tool_use` → `tool_result` (a `user`-role entry!)
→ assistant continues → … → final text). `parseLastTurn` therefore:

1. filters to `user`/`assistant` entries, dropping `isSidechain` (sub-agent) entries;
2. reverse-scans for the real turn-start — the last `user` entry that is an actual prompt, **not** a
   `tool_result` continuation;
3. folds every assistant entry from there to EOF into the mapping above.

### Wiring

Add this to your Claude Code settings (see the gitignore note below for *which* file):

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/persist-memory.mjs",
        "async": true,
        "timeout": 30
      }]
    }]
  }
}
```

#### ⚠️ Opt-in today — `.claude/settings.json` is gitignored

The #10063 ticket's plan was to commit this hook into a **project-tracked** `.claude/settings.json` so
every contributor gets it without opt-in. **That file is gitignored** (`.gitignore:116` — *"Per-user
Claude Code permissions allowlist (not shared)"*), ignored by PR #10060 itself. So today the hook is
**per-user opt-in**: paste the snippet into your own `.claude/settings.json` (Claude Code reads it) or
`.claude/settings.local.json`.

Making it the **default for all contributors** (the ticket's original intent) requires un-ignoring
`.claude/settings.json` so a shared copy can be tracked — with per-user permission grants living in
`.claude/settings.local.json` (the standard Claude Code split, where they already are). That reverses a
deliberate infra decision and touches every contributor's harness config, so it is **flagged to @tobiu
on #10063** rather than changed unilaterally.

### Testing

```bash
npm run test-unit -- test/playwright/unit/ai/claude-hooks/persist-memory.spec.mjs
```

The spec exercises `parseLastTurn` (the pure, exported parser) against the real-transcript edge cases:
trailing bookkeeping, `tool_result`-vs-prompt detection, Option-B thinking/narration fallback,
sidechain filtering, dedup, and malformed lines. The `Stop`-hook → live `addMemory` wiring is covered by
post-merge integration (open a fresh session, run N turns, then `query_raw_memories({sessionId})` → N
matches).

### Known limitations / future work

- **Large compaction-continuation turns** store a big `prompt` (the full summary). Acceptable (rare);
  truncation policy belongs in the Memory Core, not the hook.
- **Cold-start cost** — `ai/services.mjs` boots the full service graph (~500 ms–1 s). A lean
  `Memory_Service`-only entrypoint is a future optimization once the cost is measurable (not a
  prerequisite — masked by `async: true`).
- **Harness parity** — Gemini CLI / Antigravity have their own lifecycle mechanisms; extending this
  pattern to them is out of scope here.
