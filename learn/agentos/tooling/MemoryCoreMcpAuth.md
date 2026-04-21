# Memory Core MCP Authentication

The Memory Core MCP server enforces **tenant-scoped identity** on every tool invocation — regardless of whether the caller connects over **stdio** (local agents, CI runners) or **SSE** (cloud-native, multi-tenant deployments). This guide describes the dual-path identity resolution, the `AgentIdentity` graph-node binding, and the anti-spoof invariant that together close the multi-tenant isolation contract shipped across tickets #10000, #10144, and #10145.

## Why Identity Matters Here

Every write to the Memory Core's ChromaDB collections is tagged with `metadata.userId`. Every read filters on the same field. Without a reliable identity source, tenant isolation is advisory — a client can claim to be anyone, or nothing at all. The multi-tenant Memory Core deployment scope of Epic #9999 requires this substrate to be authoritative, not cooperative.

Three invariants together close the contract:

1. **Identity is server-stamped, never client-supplied.** No MCP tool schema accepts a caller-identity argument. The caller's identity is derived inside the server from transport-level claims.
2. **Write-path tagging is unconditional.** `addMemory`, `mutate_frontier`, and every future write tool reads identity from `RequestContextService.getUserId()` and tags writes with it. Read filters symmetrically apply `where: {userId}` when the context is populated.
3. **Anti-spoof guards the argument surface.** The `AuthMiddleware` service rejects any tool-call argument containing a key that would contradict server-stamped identity — closing a spoof vector before Mailbox (#10139) creates its first surface.

## The Two Paths

| Transport | Identity Source | Implementation |
|---|---|---|
| **SSE** | OIDC Bearer-token introspection | `AuthService.verifyAccessToken` (shipped in #10000) |
| **stdio** | `NEO_AGENT_IDENTITY` env-var, then `gh api user` fallback | `StdioIdentityResolver` (ticket #10145) |

Both paths end at the same destination: a `RequestContextService.run(context, ...)` wrap around tool dispatch, where the `context` shape is identical. Service-layer code reading `RequestContextService.getUserId()` is transport-agnostic.

### SSE Path — OIDC via `AuthService`

Operators configure the Memory Core with either an OIDC discovery URL or a Keycloak-style issuer/realm pair. The `AuthService` handles discovery, token introspection, audience enforcement, and extracts `preferred_username` / `sub` as the authoritative `userId`. `TransportService` wraps each `/mcp` HTTP request in `RequestContextService.run()` using the auth context.

Deployment example — Memory Core running behind Keycloak in a multi-tenant cloud environment:

```
NEO_MEMORY_CORE_TRANSPORT=sse
NEO_MEMORY_CORE_SSE_PORT=3001
NEO_MEMORY_CORE_AUTH_ISSUER_URL=https://auth.example.com/realms/neo/
NEO_MEMORY_CORE_AUTH_CLIENT_ID=neo-memory-core
NEO_MEMORY_CORE_AUTH_CLIENT_SECRET=<secret>
```

Once the server starts, every tool call from a client MUST arrive with `Authorization: Bearer <token>` where the token was issued by the configured issuer AND audience-matches the Memory Core's public URL. Tokens with `aud` claims targeting a different resource are rejected per RFC 9068.

### Stdio Path — `StdioIdentityResolver`

The stdio transport has no request-level authentication primitive — the security boundary is the trusted-process boundary. Identity is resolved **once at server boot** via the following chain:

1. **`NEO_AGENT_IDENTITY` environment variable.** Explicit pinning — the authoritative source for agent harnesses. The value is normalized: a leading `@` is stripped so the runtime identity matches GitHub API conventions (`neo-opus-4-7`, not `@neo-opus-4-7`).
2. **`gh api user` via the GitHub CLI.** Fallback for local human developers who have `gh` installed and authenticated. Silent-fails (returns `null`) if the CLI is absent, the user is not logged in, or the call exceeds a **1.5-second fail-fast budget**. A healthy `gh` resolves in <200ms; a slower call likely indicates auth-refresh or network degradation. The MCP client-side init-handshake budget (~5s total) must cover this call *plus* ChromaDB health checks, `SystemLifecycleService.ready()`, `GraphService.ready()`, and transport connect — so the gh timeout is intentionally a small fraction of that window. Single-tenant fallthrough is preferable to exhausting the handshake.
3. **`unresolved`.** Neither path yielded identity. Downstream services treat this as **single-tenant mode** (backward-compatible) — no tag on writes, no filter on reads.

The resolved identity is cached on the running server instance and wrapped around every `CallToolRequestSchema` dispatch via `RequestContextService.run()`.

## Harness Configuration

Each AI harness pins its model's identity at session start by setting `NEO_AGENT_IDENTITY`. Matches the per-model GitHub-account convention from ticket #10144 (`@neo-opus-4-7`, `@neo-gemini-3-1-pro`, `@tobiu`).

### Claude Code (`.claude/settings.json`)

```json
{
    "mcpServers": {
        "neo.mjs-memory-core": {
            "command": "node",
            "args": ["ai/mcp/server/memory-core/mcp-server.mjs"],
            "env": {
                "NEO_AGENT_IDENTITY": "neo-opus-4-7"
            }
        }
    }
}
```

### Gemini CLI / Antigravity (`.gemini/settings.json`)

```json
{
    "mcpServers": {
        "neo.mjs-memory-core": {
            "command": "node",
            "args": ["ai/mcp/server/memory-core/mcp-server.mjs"],
            "env": {
                "NEO_AGENT_IDENTITY": "neo-gemini-3-1-pro"
            }
        }
    }
}
```

### Human developer (no override)

No harness configuration required. `StdioIdentityResolver` falls back to `gh api user` and resolves to the authenticated human GitHub login. Equivalent to the `@me` shortcut semantics used elsewhere in the Agent OS tooling surface.

## AgentIdentity Graph-Node Binding

Ticket #10144 seeded three `AgentIdentity` nodes in the Native Edge Graph:

- `@neo-opus-4-7` — Claude Opus 4.7
- `@neo-gemini-3-1-pro` — Gemini 3.1 Pro
- `@tobiu` — Tobias Uhlig (human owner)

Each seeded node carries `{githubLogin, displayName, modelFamily, accountType}` properties and is addressable by its `@`-prefixed ID.

After identity resolution (SSE or stdio), the Memory Core `Server.bindAgentIdentity(userId)` helper looks up the matching graph node by prepending `@` to the bare GitHub login. The result (either the node ID or `null`) lands in `RequestContext.agentIdentityNodeId`, exposed via `RequestContextService.getAgentIdentityNodeId()`.

Services building `AUTHORED_BY` / `OWNED_BY` / future provenance edges at write time terminate their edges on the resolved node ID. Missing node is non-fatal — unseeded agents can still accumulate memories; they just can't yet terminate graph edges until someone adds them to `ai/scripts/seedAgentIdentities.mjs` and re-runs the seed script.

## The Anti-Spoof Invariant

`AuthMiddleware.validateNoIdentitySpoof(args)` rejects any tool-call whose arguments contain a key that would let the client override server-stamped identity. The currently forbidden keys:

```
userId
agentId
agentIdentityNodeId
githubLogin
from
sender
authorLogin
```

Present-day tool schemas (`add_memory`, `mutate_frontier`, etc.) don't accept any of these keys — so the middleware is a no-op on live traffic. It exists as **defense-in-depth** for Mailbox (#10139) which will add `from` fields where the spoof surface becomes real. Shipping the guard before the surface is the inverse of "patch after incident" hygiene.

**Legitimate destination fields are NOT forbidden.** `recipient` / `to` (addressee of a mailbox message) are legitimate — the sender specifying where a message goes is not a claim of authorship.

**Read-path filters by a different parameter name.** If a future tool legitimately needs to query across multiple users (e.g., an admin-only cross-tenant audit), the parameter MUST NOT be named `userId` — use `filterUserId` or similar to clearly distinguish it from the protected identity field.

## Request Context Shape

```javascript
{
    userId             : String,        // Bare GitHub login (no `@` prefix)
    username           : String,        // Human-readable display name
    agentIdentityNodeId: String | null, // `@`-prefixed graph node ID if bound
    source             : String         // Provenance: 'oidc' | 'env-var' | 'gh-cli' | 'unresolved'
}
```

All fields are populated on a best-effort basis. `userId` is `undefined` only when neither transport resolves an identity — the single-tenant fallthrough case.

## OAuth 2.1 Spec Version

The SSE path validates Bearer tokens per OAuth 2.1 draft conventions (audience enforcement, introspection-based validation, resource indicator checks per RFC 9068). Implementations targeting this Memory Core MUST:

- Issue tokens with a specific `aud` (audience) claim matching the Memory Core's public URL
- Support RFC 7662 introspection (or expose introspection metadata in the OIDC discovery document)
- Populate `preferred_username` OR `sub` in the introspection response (both honored; `sub`-fallback guarantees a non-empty `userId` for machine-to-machine client-credential flows)

## Troubleshooting

### `addMemory` writes are not tagged with `userId` in stdio mode

Check startup logs for `[neo-memory-core MCP] Identity: <userId> via <source>`. If the line reads `Identity: unresolved (single-tenant fallthrough)`:

1. Verify `NEO_AGENT_IDENTITY` is set in the harness's MCP server environment — `env` block in `settings.json`, not shell export.
2. If no `NEO_AGENT_IDENTITY` is set, verify `gh auth status` reports a valid login.
3. If `gh` is installed but the 1.5-second fail-fast timeout is exceeded, the CLI is likely hanging on auth refresh or a degraded network. The design is intentional — fail-fast preserves the MCP handshake budget for the rest of `initAsync`. Set `NEO_AGENT_IDENTITY` explicitly to skip the CLI call entirely.

### AgentIdentity node is `unbound` despite identity resolution

Startup log reads `Identity: tobiu via gh-cli — unbound (no matching AgentIdentity node)`.

- The graph node `@tobiu` does not exist in the current Memory Core graph.
- Run `node ai/scripts/seedAgentIdentities.mjs` to re-seed the canonical identities.
- For a new per-model account, add the identity to the `IDENTITIES` array in `seedAgentIdentities.mjs` before running.

### `Identity-override spoof rejected` error on a tool call

The `AuthMiddleware` refused a tool-call argument. Check that the client is not attempting to supply `userId`, `agent.authorLogin`, `from`, or any other field listed above. If the tool legitimately needs to pass an identity-adjacent value, rename the field at the schema layer.

### SSE transport returns 401 despite a valid-looking Bearer token

- Check the `aud` (audience) claim of the token — must match the Memory Core's public URL.
- Check that the OIDC introspection endpoint is reachable from the Memory Core process.
- Check that the `AuthService` was able to fetch the OIDC discovery document at startup (look for `[AuthService] OIDC Discovery successful for issuer: <url>` in the startup log).

## Service Relationships

```
┌────────────────────────────────────────────────────────────────┐
│                    MCP Tool Call Dispatch                       │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  SSE Transport   │    │ Stdio Transport  │                   │
│  │ TransportService │    │    Server.mjs    │                   │
│  └────────┬─────────┘    └────────┬─────────┘                   │
│           │                       │                             │
│           ▼                       ▼                             │
│  ┌──────────────────┐    ┌───────────────────────┐              │
│  │   AuthService    │    │ StdioIdentityResolver │              │
│  │ (OIDC introspect)│    │ (env-var + gh-CLI)    │              │
│  └────────┬─────────┘    └────────┬──────────────┘              │
│           │                       │                             │
│           └──────────┬────────────┘                             │
│                      ▼                                          │
│             ┌──────────────────┐                                │
│             │  bindAgentIdent  │                                │
│             │   (graph lookup) │                                │
│             └────────┬─────────┘                                │
│                      ▼                                          │
│        ┌─────────────────────────────┐                          │
│        │   RequestContextService     │                          │
│        │ .run(identity, dispatch)    │                          │
│        └────────────┬────────────────┘                          │
│                     ▼                                           │
│         ┌──────────────────────┐                                │
│         │   AuthMiddleware     │                                │
│         │ .validateNoSpoof()   │                                │
│         └──────────┬───────────┘                                │
│                    ▼                                            │
│         ┌──────────────────────┐                                │
│         │      callTool()      │                                │
│         │  (service dispatch)  │                                │
│         └──────────────────────┘                                │
└────────────────────────────────────────────────────────────────┘
```

## Cross-Tenant Permissions

Beyond the baseline strict-isolate policy, cross-tenant access is granted via explicit **capability edges** in the Native Edge Graph. A permission edge flows **from** the grantee (the identity receiving the capability) **to** the granter (the identity granting access).

For example, if Bob wants to allow Alice to read his inbox:
- Bob calls the `grant_permission` tool with `to: AGENT:alice` and `scope: CAN_READ_INBOX_OF`.
- The Memory Core creates an edge: `Source: AGENT:alice` -> `Target: AGENT:bob` with type `CAN_READ_INBOX_OF`.

### Valid Scopes

The system currently supports the following scopes:
- `CAN_READ_INBOX_OF`: Allows the grantee to read messages sent to the granter's inbox.
- `CAN_REPLY_TO`: Allows the grantee to send a direct message to the granter.
- `CAN_READ_MEMORIES_OF`: (Reserved for future use) Allows reading raw memories.
- `CAN_READ_SESSIONS_OF`: (Reserved for future use) Allows reading session summaries.

## Mailbox A2A Integration

The Mailbox A2A service natively integrates with the `PermissionService` to enforce the strict-isolate policy:

### Sending Messages (`addMessage`)
- To send a direct message, the sender MUST have the `CAN_REPLY_TO` permission for the target recipient.
- **Reachable Counterparty Exception:** If the target recipient has *previously sent a message* to the sender, the system infers an implicit trust chain, and the sender is allowed to reply without an explicit `CAN_REPLY_TO` edge.
- Broadcast messages (`to: AGENT:*`) are always permitted.

### Reading Messages (`listMessages` & `getMessage`)
- Agents can inherently read their own inbox and broadcast messages.
- To read another agent's inbox (e.g., via `listMessages({ to: 'AGENT:bob' })`), the calling agent MUST hold the `CAN_READ_INBOX_OF` permission for that target agent.
- Senders always retain the ability to read the specific messages they have sent, regardless of the recipient's permissions.

## See Also

- `ai/mcp/server/shared/services/AuthService.mjs` — OIDC discovery and token introspection
- `ai/mcp/server/shared/services/RequestContextService.mjs` — AsyncLocalStorage identity propagation
- `ai/mcp/server/shared/services/StdioIdentityResolver.mjs` — Stdio identity resolution
- `ai/mcp/server/shared/services/AuthMiddleware.mjs` — Anti-spoof argument validation
- `ai/mcp/server/memory-core/Server.mjs` — Composition point for stdio transport
- `ai/scripts/seedAgentIdentities.mjs` — AgentIdentity node seed script (#10144)
- `learn/agentos/tooling/Authorization.md` — Server Authorization overview
- `learn/agentos/tooling/MemoryCoreMcpApi.md` — Memory Core tool surface

## Related Tickets

- #10000 — Hardened Identity Ingestion (SSE OIDC path + RequestContextService)
- #10144 — AgentIdentity node type + seed script
- #10145 — OAuth2 authentication layer for Memory Core MCP connections (this doc)
- #10016 — Multi-Tenant Identity & Data Privacy (parent sub-epic)
- #10139 — Mailbox A2A primitive (future consumer of anti-spoof invariant)
- #9999 — Cloud-Native Knowledge & Multi-Tenant Memory Core (grand-parent epic)
