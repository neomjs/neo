---
id: 9837
title: 'MCP: Output schemas reject responses with extra properties (additionalProperties:false drift)'
state: CLOSED
labels:
  - bug
  - ai
assignees:
  - tobiu
createdAt: '2026-04-09T20:33:24Z'
updatedAt: '2026-04-18T20:26:27Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9837'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2026-04-18T19:20:30Z'
---
# MCP: Output schemas reject responses with extra properties (additionalProperties:false drift)

> **Note (2026-04-18):** This ticket was re-purposed. Its original premise — hardcoded `z.array(z.string())` for input arrays — was effectively addressed by #10043's recursive `buildZodSchemaFromNode` refactor. The ticket number is being reused because the *symptom class* (MCP schema validation failures) resurfaced on the **output** side, and the original payload never landed. See the re-purposing comment below for the audit trail.

## Problem

GitHub Copilot and other strict-JSON-Schema MCP clients crash when calling output-heavy tools on the Neo MCP servers. Example reported in the wild:

- `get_worker_topology` → `Error: Structured content does not match the tool's output schema: data/result/0 must NOT have additional properties`

Confirmed by a live session against devindex. Similar failures observed for `get_instance_properties`, `mutate_frontier`, `get_context_frontier`.

The error is not "the tool is broken" — it's that the declared JSON Schema for the tool's response has `additionalProperties: false` at nested levels, and the server returns fields not in that declared set. Clients with strict schema validation (Copilot) reject the payload; lenient clients (Claude Desktop, Cursor) pass it through silently.

## Forensic Trace (Three-Layer Interaction)

1. **Schema drift in the OpenAPI definitions.** Example: `ai/mcp/server/neural-link/openapi.yaml:905-939` declares `get_worker_topology` items with `{sessionId, appWorkerId, isSharedWorker, userAgent, environment, connectedAt}`. The actual service at `ai/mcp/server/neural-link/services/ConnectionService.mjs:312-317` stores `{appName, connectedAt, logs, sessionId}`. Two returned fields (`appName`, `logs`) aren't declared; three declared fields are never populated.

2. **`zod-to-json-schema` emits `additionalProperties: false` on every `z.object(...)`** by default. Verified:
   ```js
   zodToJsonSchema(z.object({a: z.string()}))
   // → {"type":"object","properties":{"a":{"type":"string"}},"additionalProperties":false,...}
   ```
   Undeclared fields become JSON-Schema-forbidden.

3. **#10043 inadvertently activated client-side strict validation.** Diffed pre/post. Pre-#10043, top-level outputSchema for array responses was `{type: "array"}` — which violates the MCP spec (requires `type: "object"`). Clients likely skipped validation. #10043 correctly wrapped array responses in `{result: [...]}` for spec compliance, and from that point clients began validating — surfacing the latent drift that had been silently present.

## Why \"the tools worked before\"

Not a regression in validator code per se. #10043 made validation work *correctly*; the underlying schema drift has been latent for months. The drift was harmless only because no one validated it strictly.

## Scope — Cross-Server Sweep

Emission counts from `buildOutputZodSchema` + `zodToJsonSchema` for every operation across all 5 servers:

| Server | Total ops | Strict-object schema | Strict array items |
|---|---:|---:|---:|
| file-system | 6 | 2 | 0 |
| github-workflow | 18 | 17 | 3 |
| knowledge-base | 8 | 7 | 3 |
| memory-core | 17 | 17 | 5 |
| neural-link | 34 | 31 | 11 |
| **total** | **83** | **74** | **22** |

74/83 ops could silently reject a payload if the service ever returns a field the schema doesn't declare. Whether each one actually breaks today depends on implementation drift — the `get_worker_topology`/`mutate_frontier`/`get_context_frontier`/`get_instance_properties` failures are proof that real drift exists.

## Proposed Treatment (Option C: hotfix + audit)

**Step 1 — Defense-in-depth in `ai/mcp/validation/OpenApiValidator.mjs`** (hotfix, restores all tools):

In `buildZodSchemaFromNode`, when emitting `z.object(...)` for **output** schemas, apply `.passthrough()`:
```js
zodSchema = z.object(shape).passthrough();  // emits additionalProperties: true
```
Input side must stay strict (agents passing extra fields should still get validation errors — contract safety). This requires splitting the shared recursion to distinguish input vs output paths, OR adding a context parameter.

Verified: `zodToJsonSchema(z.object({...}).passthrough())` emits `additionalProperties: true`. Restores tolerance for schema drift on the server response side without loosening input-side validation.

**Step 2 — Regression test**: extend `test/playwright/unit/ai/mcp/validation/OpenApiValidatorCompliance.spec.mjs` (from #10064) with an assertion that every emitted outputSchema either (a) sets `additionalProperties: true` on object nodes, OR (b) is explicitly marked strict. Sibling to the existing array-has-items check.

**Step 3 — Audit ticket (follow-up, not this PR)**: sweep actual service returns vs declared OpenAPI schemas, realign them. Step 1 tolerates drift; Step 3 fixes the drift at the source.

## Avoided Traps

- **Not** reverting #10043. That change correctly satisfies the MCP spec; reverting would regress Copilot-style strict-validator compatibility in other ways.
- **Not** flipping the global `zod-to-json-schema` config. `additionalProperties: false` is correct for *input* schemas where contract violations should fail fast. The asymmetry (strict in, lenient out) matches the fault model: server implementations evolve independently of schemas; client contracts must stay pinned.
- **Not** auditing every response schema inline. 74 tools is too large a surface for a single PR. The `.passthrough()` hotfix buys time for a proper audit without keeping Copilot users blocked.

## Related

- Sibling: #10064 (input-side `items`-missing issue — same MCP schema validation family, different facet)
- Supersedes original premise: #10043 addressed the nested array issue #9837 originally described
- Originally blocked: #9838 (cross-referenced from this ticket's history)

## Origin Session ID

`97343e6e-9d1c-4170-b3a5-6e58d41511b6` (this session, diagnosed via `self-repair` skill)

## Timeline

- 2026-04-09T20:33:25Z @tobiu added the `enhancement` label
- 2026-04-09T20:33:25Z @tobiu added the `ai` label
- 2026-04-09T20:47:38Z @tobiu cross-referenced by #9838
- 2026-04-18T17:46:18Z @tobiu cross-referenced by #10064
- 2026-04-18T17:51:31Z @tobiu cross-referenced by PR #10065
- 2026-04-18T19:08:16Z @tobiu removed the `enhancement` label
- 2026-04-18T19:08:16Z @tobiu added the `bug` label
- 2026-04-18T19:08:16Z @tobiu changed title from **MCP Server: Support nested array schemas in OpenApiValidator** to **MCP: Output schemas reject responses with extra properties (additionalProperties:false drift)**
- 2026-04-18T19:08:18Z @tobiu assigned to @tobiu
### @tobiu - 2026-04-18T19:08:20Z

**Input from Claude Opus 4.7 (Claude Code):**

> ❋ **Re-purposing audit trail (2026-04-18)**
> 
> The original premise of this ticket — hardcoded `z.array(z.string())` forcing all OpenAPI array inputs to string arrays — was effectively resolved by #10043's recursive refactor of `buildZodSchemaFromNode`, which now recurses into `items` properly. The original payload never landed as a direct PR.
> 
> Rather than close a ticket that has graph edges already (cross-referenced by #9838, labeled `ai`), and immediately file a near-identical new ticket, the title/body have been rewritten in place to cover the **output-side** manifestation of the same symptom class: strict MCP clients (notably GitHub Copilot) rejecting responses with `additionalProperties: false` in the declared outputSchema.
> 
> Diagnosed via `self-repair` skill protocol; evidence captured in the updated body above.

- 2026-04-18T19:13:10Z @tobiu referenced in commit `a608ac6` - "fix(mcp): tolerate extra properties on output schemas to satisfy strict validators (#9837)"
- 2026-04-18T19:14:16Z @tobiu cross-referenced by PR #10067
- 2026-04-18T19:20:30Z @tobiu referenced in commit `11eab7e` - "fix(mcp): tolerate extra properties on output schemas to satisfy strict validators (#9837) (#10067)"
- 2026-04-18T19:20:30Z @tobiu closed this issue
- 2026-04-18T19:57:05Z @tobiu cross-referenced by #10068
- 2026-04-18T20:02:59Z @tobiu cross-referenced by PR #10069
### @tobiu - 2026-04-18T20:26:27Z

**Input from Claude Opus 4.7 (Claude Code):**

> ❋ **Post-merge correction (2026-04-18): the proposed Step 3 audit should NOT be filed.**
> 
> While discussing follow-up tickets after PR #10067 merged, tobiu flagged a blind spot in my original framing: I was treating MCP tool outputs as typed contracts (the REST-API Gold Standard), but a meaningful subset of them — **Neural Link's runtime introspection tools** — are fundamentally different. `get_vnode`, `get_component_tree`, `get_instance_properties`, VDOM/VNode accessors, etc. surface **live application state** where the response shape is as open-ended as the app itself. VDOM nodes carry arbitrary HTML attrs (`aria-*`, `data-*`, handlers, styles); component instances expose hundreds of configs per class, multiplied across framework + app subclasses.
> 
> Enumerating that in OpenAPI either produces "optional everything" schemas (strict-by-letter, useless-by-spirit) or artificially narrows responses and breaks introspection. **For this class of tool, open shapes are the feature.** The `.passthrough()` that landed in PR #10067 is **architecturally correct design**, not a hotfix awaiting a stricter fix.
> 
> ### Revised categorization
> 
> | Category | Examples | Correct strategy |
> |---|---|---|
> | **Closed contracts** | `healthcheck`, GitHub workflow ops (`create_issue`, `manage_issue_assignees`…), KB queries with fixed result shape | Narrow schemas + drift auditing make sense. `additionalProperties: false` is a legitimate contract. |
> | **Runtime introspection** | Neural Link's `get_vnode`, `get_component_tree`, `get_instance_properties`, `inspect_component_render_tree`, `query_vdom`, `query_component` | Open shapes by design. `.passthrough()` is correct, not a hotfix. Do NOT audit to narrow. |
> 
> ### What this means for this ticket's Step 3
> 
> The "Step 3 — schema-vs-implementation audit" bullet in this ticket's body should be read as **superseded**. Closing the full loop would require (a) identifying which tools fall into the closed-contract bucket and auditing *those*, and (b) explicitly documenting the runtime-introspection tools' openness so future agents don't mistakenly narrow them. If someone picks up the audit work later, the scope is materially smaller than the body implies and must be category-aware.
> 
> Saved this as durable feedback (`feedback_mcp_output_category_split.md`) so future sessions don't re-propose the same audit trap.
> 
> Cross-posted to PR #10067 for symmetry.


