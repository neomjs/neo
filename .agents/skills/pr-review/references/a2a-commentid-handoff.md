# A2A Comment-ID Hand-off Protocol (`#10272`)

Extracted from `pr-review-guide.md §10` per Map-vs-Atlas (#12447) — the warm-cache review-cycle hand-off mechanics. Loaded only when a multi-cycle review hand-off fires; the guide keeps the one-line trigger.

**Problem:** Without commentId-scoped fetch, every review cycle N+1 incurs **cumulative-thread context cost** — full-thread fetch reads all prior cycles, not just the delta. This breaks linear-cost scaling: by cycle three of an Architectural Pillar review, fetching the full conversation burns more tokens on prior rounds than on the new substance. Compounds silently across the swarm — every reviewer pays the cumulative cost per cycle, not just once. **Treat as invariant discipline, not optional optimization** — the cost asymmetry diverges with thread length, and missed pings cascade across reviewers.

Provenance: PR `#10371` showed cumulative-thread fetch cost diverging with thread length. The stable rule is commentId-scoped hand-off for warm-cache review cycles.

**Solution:** `manage_issue_comment` action:`create` returns `{message, commentId, url, createdAt}`. The reviewer captures `commentId` from that response and relays it to the next reviewer (peer or author) via A2A mailbox — the recipient fetches just-this-comment via `get_conversation({pr_number: N, comment_id: COMMENT_ID})`, scaling linearly with new-comment volume rather than cumulative thread size.

## 1. Workflow

1. Reviewer posts their review comment via `manage_issue_comment({action: 'create', pr_number, body, agent})`.
2. Reviewer captures `commentId` from the response.
3. Reviewer sends an A2A mailbox DM to the next actor (peer reviewer or author) via `add_message`:
   ```
   subject: 're: PR #N review cycle K'
   body: 'Review posted at PR #N comment <COMMENT_ID>. Substance: <one-line summary>.'
   relatedTickets: ['#N']
   ```
4. Recipient reads the A2A message, extracts `COMMENT_ID`, calls `get_conversation({pr_number: N, comment_id: COMMENT_ID})` — receives only this reviewer's comment, not the whole thread history.

## 2. Selector Precedence

`get_conversation` accepts three optional selectors. First match wins:

- `comment_id` — single-comment fetch. Used by the A2A hand-off pattern above.
- `since_comment_id` — fetch comments strictly AFTER the given anchor. Used for incremental polling: track last-seen commentId, fetch only what's new.
- `last_n` — fetch the last N comments. Coarse-grained catch-up when commentIds aren't tracked.
- Omitting all three returns the full conversation (backward-compatible default).

## 3. Anti-Patterns

- **Full-conversation-fetch-per-cycle when commentId is available.** If the A2A message carries a commentId, use it. Otherwise the propagation discipline is broken.
- **Mailbox DM without commentId when the message is pointing at a specific comment.** Forces recipient to fetch full thread and grep for the intended passage — negates the efficiency gain.
- **Passing all three selectors at once expecting a merge.** First-match semantics; excess selectors are ignored.
- **Rigidly applying commentId-scoped fetch in a cold-cache case** (e.g., fresh session bootstrap, Cycle 1 review). Lands one isolated comment in a void without the prior context it depends on. See §5 below.
- **Skipping the Pre-Flight Check (§4) before yielding turn after `manage_issue_comment`.** Empirically the dominant failure mode — agents read this guide, draft the comment, post it, and forget to capture commentId + send A2A ping. Proven mitigation: explicit reasoning-statement mirroring the `AGENTS.md §3 / §4.2` Pre-Flight pattern.

## 4. Pre-Flight Check (operational reflex)

The hand-off protocol is mechanical — but reviewers empirically miss it across cycles even after reading this guide (PR `#10371` + `#10375`, 2026-04-26: 5+ missed pings before @tobiu surfaced the gap explicitly). The discipline is reflex-application, not knowledge.

**Pre-Flight Check shape** (mirrors `AGENTS.md §3 / §4.2` proven primitives). After every `manage_issue_comment` create, before yielding turn, you MUST explicitly state in your internal reasoning:

> *"Pre-Flight: I posted review commentId `<ID>` for cycle K. I have (or will) send an A2A ping to `<recipient>` via `add_message` with the literal commentId in the body so they can call `get_conversation({pr_number, comment_id})` for scoped fetch."*

This commitment-statement is the gate that permits yielding turn. The `add_memory` discipline already proves this Pre-Flight pattern works as a reflex enforcement primitive when paired with explicit pre-action reasoning. Skipping forces the next cycle's actor to re-read the full thread — the empirical-anchor ~8× cost ratio quantifies the cost.

Cold-cache exception applies when the recipient lacks prior-cycle context — see §5 below for when full-thread fetch is the right call instead.

## 5. Cold-Cache Exception

CommentId-scoped fetch is the **warm-cache** path — the reviewer or author has continuous prior-cycle context loaded in the current context window. **Cold-cache cases require a different fetch shape:**

| Cold-cache case | Fetch shape | Reason |
|---|---|---|
| **Fresh session bootstrap** | Full-thread fetch + `query_summaries` / `query_raw_memories` for Memory Core grounding | No prior cycle context loaded; commentId-scoped fetch lands one comment in a void |
| **Cycle 1 review** | Full-thread fetch | First ramp on the PR; no prior cycle exists; need full diff + body for grounding |
| **Cross-agent handoff** | Full-thread fetch + memory query against the prior agent's session-id | Different reviewer/author than prior cycle; no shared mental model |
| **Missed/lost A2A ping** | `since_comment_id` from last-known anchor, OR `last_n: 3-5`, OR full-thread fallback | No commentId pointer to scope from |

The dichotomy mirrors the boot-pull-vs-sunset-pull lifecycle distinction (`AGENTS_STARTUP §0` vs `session-sunset` skill body Step 1): **warm path** optimizes for incremental context; **cold path** grounds from scratch. They are NOT symmetric operations — they fill different lifecycle gaps. Don't confuse them: rigidly applying commentId-scoped fetch in a cold-cache case lands one isolated comment without the context it depends on; over-fetching on principle in a warm-cache case defeats the linear-cost scaling.

**The right reflex** — before fetching, ask: *"do I have prior cycle context loaded in this context window?"* If yes → commentId-scoped fetch (or `since_comment_id` for incremental polling across stale-anchor recovery). If no → full-thread fetch + memory query for grounding.
