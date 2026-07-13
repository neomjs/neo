# ADR 0002: Phase 3 Wake-Substrate Standards Alignment

> Architectural Decision Record for the Phase 3 cross-harness autonomous wake
> substrate. Specifies concrete schema mappings against MCP and A2A standards
> for the three architectural shapes converged in Discussion #10354 — closing
> the human-postman gap that forces tobi-as-relay between Claude Code and
> Antigravity sessions.

| Attribute | Value |
|---|---|
| **Status** | Proposed — 2026-04-26 |
| **Author** | Claude Opus 4.7 (Claude Code) |
| **Resolves** | #10355 |
| **Unblocks** | Discussion #10354 graduation to Epic + concrete Shape A/B/C implementation sub-tickets |
| **Parent Epic** | #10311 (Phase 1 Swarm Autonomy → Phase 3 wake substrate is the natural sub-tree) |
| **Informs** | #10334, #10342 (A2A primitives this extends), #10353 (substrate prerequisite), #10312 / #10335 (heartbeat that becomes fallback per OQ 7), #10349 (sunset-protocol-handover use case for `taggedConcepts` filter) |

---

## 1. Context

Discussion #10354 ("Phase 3: Cross-harness autonomous wake substrate — closing
the human-postman gap") has converged through 4 iterations between Claude Opus
4.7 and Gemini 3.1 Pro (Antigravity). All six substantive Open Questions
resolved to AC. **Sole remaining graduation gate** is a standards-alignment
reference document — concrete schema mappings for the three architectural
shapes against MCP and A2A standards.

This ADR is that document.

The empirical-stratification telemetry from session-arc
`48197e2e-…` → `52e84f76-…` validated five layers of substrate (SQLite
routing, edge attachment, mailbox-driven instruction-following, cross-harness
output to human-visible surface, same-session wake on the Antigravity side)
and isolated **Layer 6 — autonomous wake from idle across session
boundaries** as the genuine remaining gap on both harnesses. The Step 2
Task-lifecycle test measured the substrate floor at **7 seconds** for one full
`transitionTask` round-trip across harnesses — meaning Phase 3 wake substrate
races against ~3.5s per-transition latency, not against the 10m 34s
human-postman delay observed empirically.

The architectural shape was decided in iteration 2 (**Shape D Hybrid**: MCP
notifications when supported → A2A webhooks when MCP push absent → bridge
daemon fallback for harnesses without native push primitives). Iteration 3+4
resolved the subscription surface (three trigger primitives + four optional
filters) and subscription state location (graph-resident `WAKE_SUBSCRIPTION`
node + in-memory MCP server cache).

What remained — and is the substance of this ADR — is the concrete wire-format
contract that Shape A/B/C implementation sub-tickets will build against.

---

## 2. Existing Substrate Audit (Critical Finding)

**Both relevant industry standards already define the primitives we need.**
This ADR's solution space is reshaped by this discovery; rejecting the
"author a competing protocol" framing is the single most important
architectural decision after Shape D Hybrid.

### 2.1 The MCP Specification (server-push notifications)

The [Model Context Protocol specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25)
defines bidirectional stateful communication with streaming semantics.
Specifically:

- Servers can emit `notifications/message` events to subscribed clients
  via the persistent session handle
- Capability negotiation happens at MCP `initialize` — clients declare
  support for notifications
- Per the spec: *"MCP servers can push events instantly, such as new tools
  or log updates, instead of forcing clients to poll repeatedly, ensuring
  fresher data with less load."*

**Current state of Claude Code's MCP client:** the spec is supported on the
server side; Claude Code as MCP **client** does not yet subscribe to
notifications. The OQ 1 vendor probe confirmed this is plausibly on the
post-Channels-research-preview roadmap. Filing an Anthropic feature request
is the parallel meta-action (per Discussion #10354 OQ 1 resolution).

**Substrate verdict:** the protocol shape exists. We extend it for our
specific event types (`wake/*`) and consume from servers that support push;
we don't reinvent the transport.

### 2.2 The A2A Protocol Specification (webhook push notifications)

The [Agent2Agent (A2A) Protocol specification](https://a2a-protocol.org/latest/specification/)
defines async push notifications via webhook for long-running Task updates.
Per the [streaming-and-async docs](https://a2a-protocol.org/latest/topics/streaming-and-async/):

- Server-Sent Events (SSE) for streaming incremental task updates over an
  active HTTP connection
- Webhook push notifications for asynchronous task-state updates when SSE
  isn't appropriate
- Per the 2026-04 ecosystem report: 150+ organizations have A2A in production
  for inter-agent task routing

**Current state of our A2A alignment:** Track 2 of #10311 already aligned
the Memory Core's mailbox MESSAGE node with the A2A Task envelope (#10334)
and the state machine (`Submitted → Working → Completed` with optimistic
concurrency, #10342). Extending that alignment to the **notification layer**
is the natural next step — same standard, same Task envelope shape, new
push channel.

**Substrate verdict:** the protocol shape exists; we already align with it
for the data layer (envelope + state machine). Section 7.2 specifies how the
notification layer extends.

### 2.3 The `GraphLog` + `syncCache` Primitive (Shape C foundation)

`ai/graph/storage/SQLite.mjs` already implements a write-ahead change log
via SQLite triggers (described in detail in ADR 0001 §2.1-2.3). Every node
or edge mutation appends an entry to `GraphLog`, durably visible to all
processes sharing the SQLite-WAL backing file. `Database.mjs#syncCache()`
implements delta-replay via `lastSyncId`.

For Shape C wake daemon, this primitive provides the cross-process event
stream we'd otherwise need to invent. The daemon is a `syncCache` consumer
running outside the MCP server — it watches `lastSyncId` advance, filters
delta entries by trigger primitive, evaluates against subscriptions, emits
to harness adapters.

**Substrate verdict:** existing primitive directly applicable. Shape C
implementation reuses the same patterns ADR 0001 hardened (the
`acknowledgeLocalMutations()` discipline applies symmetrically — daemon
calls into SQLite as a peer process, not a writer).

---

## 3. Decision Drivers

In priority order:

1. **Cross-harness portability.** Both Claude.app and Antigravity must be
   reachable. Vendor-monoculture assumptions fail empirically — Discussion
   #10354 OQ 1 confirmed Claude.app has no native wake API today.
2. **Standards alignment.** A2A and MCP both have native push primitives at
   2026 production maturity. Reinventing creates a parallel substrate
   competing with primitives we already align with.
3. **Latency floor.** Substrate floor is ~3.5s/transition (Step 2 measured).
   Wake substrate must not amplify this; coalescing window (per OQ 6) caps
   the latency-vs-token-economy trade-off at 30-60s.
4. **Vendor-roadmap independence.** Per Gemini iteration 3: *"swarm
   architecture cannot afford to block on external vendor roadmaps when a
   pragmatic fallback exists."* Shape C wake daemon unblocks Claude.app
   today regardless of when MCP notification subscription lands.
5. **Token-economy preservation.** OQ 6 — wake substrate must NOT be 1:1
   with event stream at high velocity, or broadcast bursts cause
   catastrophic token burn and session thrashing.
6. **Restart durability.** Subscriptions survive MCP server restart.
   Graph-resident `WAKE_SUBSCRIPTION` per OQ 3.
7. **Multi-tenant readiness.** Pre-#9999 ships single-tenant; the
   substrate transitions transparently when RLS engages via existing
   `userId` scoping (per #10325 sharedEntity discipline).

---

## 4. Considered Options

The four shapes from Discussion #10354 are recapitulated here for self-contained
ADR readability; the substantive analysis lives in the Discussion body.
Additional rejected options surfaced during ADR drafting are listed.

### 4.1 Shape (A) — MCP Server-Push Notifications [SELECTED for harnesses that support]

Memory Core MCP server emits `notifications/message` per the MCP spec.
Subscribed harnesses receive on persistent session handle. Cleanest standards
alignment.

**Pros:** standards-aligned, push-semantic (no polling latency floor),
already-deployed transport in our MCP servers.
**Cons:** vendor-coupling — Claude Code MCP client doesn't yet subscribe.

### 4.2 Shape (B) — A2A Webhook Push Notifications [SELECTED as alternative push path]

HTTP POST to webhook URL registered per agent identity. Extends our existing
A2A alignment (#10334, #10342) to the notification layer.

**Pros:** standards-aligned, vendor-agnostic, doesn't require MCP-client
support.
**Cons:** requires HTTP server in each harness; firewall considerations for
non-localhost.

### 4.3 Shape (C) — Out-of-Band Wake Daemon [SELECTED as fallback]

Watchdog process consumes `GraphLog` deltas via existing `syncCache` pattern;
emits to per-harness adapters (`tmux send-keys`, `osascript`, native APIs).

**Pros:** vendor-agnostic, no harness changes required, reuses existing
substrate (ADR 0001's hardened cache-coherence primitive).
**Cons:** per-harness adapter complexity, fragile (osascript needs
Accessibility API permission), polling-with-event-trigger rather than pure
push.

### 4.4 Shape (D) — Hybrid (Standards-First with Bridge Fallback) [SELECTED as overall architecture]

Detect harness capabilities at boot. Route to Shape A → B → C in priority
order. Per-identity registry maps `harness_id → wake_path`.

**Selected** as the overall Phase 3 architecture per Discussion #10354
iteration 2 consensus.

### 4.5 Option (E) — Custom Wake Protocol [REJECTED]

**Approach:** invent Neo-specific wake protocol with proprietary payload
schema and transport.

**Rejection rationale:**
- Reinvents primitives that A2A and MCP already provide
- Forces every harness vendor to implement Neo-specific support; conflicts
  with the ecosystem direction (150+ orgs on A2A in production)
- Training-data attractor: "build a custom protocol when you need control"
  doesn't apply when the standards already cover the use case

### 4.6 Option (F) — Polling-Only via Heartbeat [REJECTED as primary; retained as fallback]

**Approach:** the existing `swarm-heartbeat.sh` (#10312) polls inbox at fixed
interval and injects via `tmux send-keys`.

**Rejection rationale (as primary):**
- Latency floor: 5min default poll interval; tightening to 30s creates
  unnecessary CPU + DB load
- Inverts the standards-alignment direction (push is strictly superior
  when supported)
- Per Gemini iteration 2 OQ 7: *"the heartbeat should eventually be
  relegated to a pure system-level watchdog, not the primary message bus."*

**Retained as fallback** for the `harnessTarget: 'disabled' | 'none'`
configurations and as the universal backup before Shape A/B/C land in
specific harnesses.

### 4.7 Option (G) — Vendor Push Services (APNs / FCM / etc.) [REJECTED]

**Approach:** route wake events through Apple Push Notification Service or
equivalent platform-native push.

**Rejection rationale:**
- Cross-harness incompat: APNs targets iOS/macOS apps with bundle-IDs;
  Antigravity's Linux-side or Claude.app's macOS-side can't share routing
- Adds cloud-vendor dependency where local-substrate suffices
- Wrong-substrate: APNs is for end-user notifications, not inter-process
  agent coordination

### 4.8 Option (H) — WebSocket Realtime Channel [REJECTED]

**Approach:** standalone WebSocket server for wake events; harnesses connect
and listen.

**Rejection rationale:**
- Collapses into Shape A or B at the implementation level — still need
  per-harness handler logic
- Adds new network surface (WebSocket port) without substrate gain over
  MCP notifications (which already handle bidirectional streaming on the
  established MCP transport)
- Service-boundary violation: WebSocket-server-as-substrate doesn't match
  any existing Memory Core surface

---

## 5. Decision Outcome

**Choose Shape (D) Hybrid: standards-first MCP notifications (Shape A),
fall back to A2A webhooks (Shape B) when MCP push absent, fall back to
wake daemon (Shape C) when neither.**

The architectural decision was made in Discussion #10354 iteration 2 with
both authors aligned. This ADR specifies the **concrete schemas** that
Shape A/B/C implementation sub-tickets consume.

### 5.1 Implementation routing

At `manage_wake_subscription({action: 'subscribe', ...})` time, the MCP
server records the subscription's `harnessTarget` based on the agent's
declared capabilities. Per-identity capability detection happens at boot:

```
  AGENT boot →
    initialize MCP session with capabilities advertisement →
      if client supports notifications: harnessTarget = 'mcp-notifications'
      else if client provides webhook URL: harnessTarget = 'a2a-webhook'
      else if wake daemon available: harnessTarget = 'bridge-daemon'
      else: harnessTarget = 'disabled' (fallback to heartbeat polling)
```

Shape A/B can coexist: an agent can declare both, in which case MCP
notifications are preferred (lower latency, no HTTP overhead).

### 5.2 Presence and wake-policy layer

Shape D selects a delivery channel. It does not, by itself, decide whether a
wake should interrupt an active harness turn, wait for the next turn, or remain
stored-only. That decision needs a small overlay that keeps receiver state and
delivery intent separate from transport capability and message priority.

#### 5.2.1 `HarnessPresence`

`HarnessPresence` describes the receiving harness state independently from the
wake event's semantic importance. It is a routing input, not a new transport.

Baseline state vocabulary:

| State | Meaning | Routing implication |
|---|---|---|
| `unknown` | No trustworthy presence signal exists for this harness/session. | Default to non-interrupting delivery; store unread and rely on next-turn mailbox checks unless a native channel can prove safe handling. |
| `idle` | The harness can accept a new turn without clobbering active work or user input. | `wakePolicy: 'immediate'` may start a turn through the harness-native control plane when available. |
| `active` | A model turn is in progress. | `wakePolicy: 'immediate'` may steer the active turn only if the harness exposes a native active-turn API and the caller can provide the active turn id. |
| `waitingOnApproval` | The active turn is blocked on an approval / user decision. | Treat as active; never overwrite the approval prompt. Native steering may be safe only when it appends context without changing the approval surface. |
| `userTyping` | The operator has unsent input in the harness. | Do not inject. Preserve the input and route through `next_turn` / stored unread delivery. |

Suggested metadata:

```ts
type HarnessPresence = {
  state        : 'unknown' | 'idle' | 'active' | 'waitingOnApproval' | 'userTyping',
  activeTurnId?: string,
  capabilities?: string[],
  lastSeenAt  : string,
  source      : 'codex-app-server' | 'mcp-client' | 'a2a-webhook' | 'bridge-daemon' | 'os-ui-probe' | 'unknown'
}
```

Codex app-server is the current native-control-plane example: it exposes thread
runtime status (`notLoaded`, `idle`, `systemError`, or `active` with
`activeFlags`) via thread reads and `thread/status/changed`, and it exposes
`turn/start` for idle threads plus `turn/steer` for active turns with an
`expectedTurnId` guard. That lets Codex routes prove presence through a native
API rather than inferring it from UI widgets.

For harnesses without a native presence API, `unknown` is the safe default. A
wake daemon may eventually infer coarse presence from UI state, but that is a
fallback adapter, not the architecture.

#### 5.2.2 `wakePolicy`

`wakePolicy` describes delivery behavior independently from semantic `priority`
and `harnessTarget`.

| Policy | Behavior | Notes |
|---|---|---|
| `silent` | Store only; do not emit a wake. | Useful for mailbox-only handovers and sunset notes that must not interrupt current work. |
| `next_turn` | Store unread; the recipient picks it up during the mandatory turn-start mailbox check. | Safe default for normal coordination, unknown presence, and unsafe immediate delivery. |
| `immediate` | Attempt live delivery through the safest available channel for the current `HarnessPresence`. | Requires capability and no-clobber proof; does not imply `priority: high` and is not implied by it. |

`priority` remains the semantic importance signal (`high | normal | low`).
`wakePolicy` is the delivery contract. A high-priority message may still be
`next_turn` when interrupting would corrupt active work, and a short guardrail
message may be `immediate` even when its semantic priority is not high. Reviewers
MUST reject PRs that collapse these fields.

#### 5.2.3 Routing examples

The routing order remains Shape D, now filtered through presence and policy:

1. `wakePolicy: 'silent'`
   - Persist the message / task transition only.
   - Do not enqueue MCP, A2A, bridge, or heartbeat wake delivery.

2. `wakePolicy: 'next_turn'`
   - Persist unread state.
   - The recipient's turn-start mailbox check is the delivery point.
   - No native push is required, even if the subscription is push-capable.

3. `wakePolicy: 'immediate'` + Codex native control plane
   - `HarnessPresence.state === 'active'` and `activeTurnId` known:
     use Codex app-server `turn/steer` with `expectedTurnId`.
   - `HarnessPresence.state === 'idle'` on a loaded thread:
     use Codex app-server `turn/start`.
   - `notLoaded` / no current thread:
     load or start the thread via the app-server thread APIs only when the
     calling workflow has explicit authority to create that turn; otherwise
     degrade to `next_turn`.

4. `wakePolicy: 'immediate'` + standards push
   - Use Shape A (`harnessTarget: 'mcp-notifications'`) when the MCP client
     negotiated wake notification support.
   - Else use Shape B (`harnessTarget: 'a2a-webhook'`) when the harness
     registered a webhook endpoint.
   - The receiver still applies local presence rules before mutating an active
     prompt surface.

5. `wakePolicy: 'immediate'` + bridge fallback
   - Use Shape C (`harnessTarget: 'bridge-daemon'`) only after native / standards
     routes are unavailable or insufficient.
   - If the bridge cannot prove the harness is idle or safely append-only,
     degrade to `next_turn`.

6. `harnessTarget: 'disabled' | 'none'` or degraded delivery
   - Persist unread state and rely on mailbox checks / heartbeat fallback.
   - Do not treat failed push as permission to clobber a local UI surface.

#### 5.2.4 OS-level presence probes are last resort

OS UI polling can be useful empirically, but it is brittle: button labels such
as `Send`, `Stop`, or `Cancel` are vendor UI details, not protocol state. They
can drift without an API version, can race with user typing, and may require
focus changes that conflict with the AppleScript focus-safety work owned by
#10422.

If a bridge fallback implements button-state probing, the initial polling
interval MUST be conservative: 5 seconds, with focus checks, timeout limits,
and a hard no-clobber guard for active user input. Failure to read UI state
safely means `HarnessPresence.state = 'unknown'` and the route degrades to
`next_turn`.

Scope boundaries:

- This section does not implement the polling adapter.
- This section does not change wake subscription persistence, GC, or integrity
  semantics owned by #10515.
- This section does not solve AppleScript focus-steal mechanics from #10422; it
  only states the routing constraint those mechanics must satisfy.

---

## 6. Concrete Specifications

### 6.1 MCP Notifications Schema (Shape A)

The Memory Core MCP server emits `notifications/message` events conforming to
the MCP spec's notification framework. Three event types correspond to the
three trigger primitives (per Discussion #10354 OQ 2):

All event payloads carry two delivery-tracking identifiers in the `data` field: `eventId` (ULID,
unique per emission for transport-layer idempotency) and `logId` (the originating
`GraphLog.log_id` of the substrate mutation that triggered the event, stable across re-emissions
for cursor-based catchup). A source that owns an immutable typed event also carries
`sourceEventId`: the source fact's stable identity across live delivery, retry, reconnect resync,
and daemon restart. Transport retry of one emission retains `eventId`; resync creates a new
`eventId` while retaining `sourceEventId`. This additive separation prevents transport-attempt
identity from being overloaded as source-fact identity. See §6.1.6 for the disconnect-reconnect
mechanics that depend on these.

#### 6.1.1 `wake/sent_to_me` payload

```json
{
  "method": "notifications/message",
  "params": {
    "level": "info",
    "logger": "neo-wake-substrate",
    "data": {
      "schemaVersion": "1.0",
      "eventType": "wake/sent_to_me",
      "eventId": "01HXXX...",
      "logId": 12345,
      "agentIdentity": "@neo-opus-4-7",
      "subscriptionId": "WAKE_SUB:c0ffee01-…",
      "payload": {
        "messageId": "MESSAGE:uuid",
        "from": "@neo-gemini-3-1-pro",
        "subject": "string ≤ 200 chars",
        "priority": "high|normal|low",
        "taggedConcepts": ["concept-a", "concept-b"],
        "isReplyTo": "MESSAGE:parent-uuid|null",
        "isBroadcast": false
      },
      "emittedAt": "2026-04-26T10:00:00.000Z"
    }
  }
}
```

#### 6.1.2 `wake/task_state_changed` payload

```json
{
  "method": "notifications/message",
  "params": {
    "level": "info",
    "logger": "neo-wake-substrate",
    "data": {
      "schemaVersion": "1.0",
      "eventType": "wake/task_state_changed",
      "eventId": "01HXXX...",
      "sourceEventId": "server-owned-task-transition-uuid",
      "logId": 12346,
      "agentIdentity": "@neo-opus-4-7",
      "subscriptionId": "WAKE_SUB:c0ffee02-…",
      "payload": {
        "taskId": "MESSAGE:uuid",
        "previousState": "Submitted",
        "newState": "Working",
        "originator": "@neo-opus-4-7",
        "assignee": "@neo-gemini-3-1-pro",
        "lastModifiedAt": "2026-04-26T10:00:00.000Z"
      },
      "emittedAt": "2026-04-26T10:00:00.000Z"
    }
  }
}
```

#### 6.1.3 `wake/permission_granted` payload

```json
{
  "method": "notifications/message",
  "params": {
    "level": "info",
    "logger": "neo-wake-substrate",
    "data": {
      "schemaVersion": "1.0",
      "eventType": "wake/permission_granted",
      "eventId": "01HXXX...",
      "logId": 12347,
      "agentIdentity": "@neo-opus-4-7",
      "subscriptionId": "WAKE_SUB:c0ffee03-…",
      "payload": {
        "scope": "CAN_REPLY_TO|CAN_READ_INBOX_OF|CAN_READ_MEMORIES_OF",
        "grantedBy": "@neo-gemini-3-1-pro",
        "grantedAt": "2026-04-26T10:00:00.000Z"
      },
      "emittedAt": "2026-04-26T10:00:00.000Z"
    }
  }
}
```

#### 6.1.4 Capability negotiation

At MCP `initialize`, the client's `capabilities` declaration MAY include:

```json
{
  "experimental": {
    "neo-wake-substrate": {
      "version": "1.0",
      "supportedEvents": ["wake/sent_to_me", "wake/task_state_changed", "wake/permission_granted"]
    }
  }
}
```

Server responds with its own declaration confirming the substrate is active.
If the client doesn't include `neo-wake-substrate` in `experimental`, server
falls through to A2A webhook (Shape B) registration if available, then bridge
daemon (Shape C).

#### 6.1.5 Subscription handshake

Subscription is created via the standard `manage_wake_subscription` MCP tool
(Section 6.4). The server records the subscription with
`harnessTarget: 'mcp-notifications'`; subsequent events fire on the
notification channel.

#### 6.1.6 Dropped-Connection Semantics

Shape A relies on the MCP transport's persistent session handle for live
event delivery. When the transport breaks (TCP close, timeout, network
partition), the server cannot deliver in-flight events. **Decision:
client-driven watermark resync rather than server-side queueing** — aligns
with the existing `GraphLog + lastSyncId` pattern from ADR 0001 and reused
by Shape C wake daemon.

**Watermark mechanics:**

- Each wake event carries `logId` (the originating `GraphLog.log_id` of the
  substrate mutation that triggered it) plus `eventId` (a ULID unique per
  emission). A source-owned typed event additionally carries stable `sourceEventId`.
  See §6.1.1-6.1.3 payloads. Shape B heartbeat pulses use the
  same watermark contract through an explicit `heartbeat_pulse` GraphLog row:
  no `MESSAGE` node and no `SENT_TO` edge are created, so reconnect replay can
  wake the wake daemon without adding inbox-visible content.
- Client persists `lastSeenLogId` per subscription — typically in
  harness-local state alongside the subscription ID. The persistence
  granularity is the client's call: per-event commit (most durable, more
  I/O) or windowed checkpoint (e.g., every N events / every M seconds).
- On reconnect, client calls `manage_wake_subscription({action: 'resync',
  subscriptionId, sinceLogId})` (see §6.4). The server:
  1. Queries `GraphLog` from `sinceLogId` forward
  2. Re-applies the subscription's current trigger + filter spec to the
     delta entries (handles the case where filters were updated during the
     disconnect window — the resync uses *current* spec, not historical)
  3. Re-emits matching events as notifications with **new `eventId` ULIDs
     but the same `logId` values and, when present, the same `sourceEventId`** — preserving
     both cursor and source-fact anchors while making the new transport emission distinguishable
- After resync completes, live notifications resume on the persistent
  session handle.

**Why client-driven (rather than server-queue):**

- Server stays stateless w.r.t. per-client delivery cursor — no memory
  pressure from disconnected-client queues, no "events lost on server
  restart" problem
- `GraphLog` is *already* the durable substrate queue (per ADR 0001 §2.1);
  re-deriving events from it is symmetric with how Shape C wake daemon
  consumes the same delta stream. Single-source-of-truth discipline.
- Idempotent: the same `sinceLogId` query returns the same events from
  `GraphLog` (subject to filter changes, which the resync naturally
  handles via current-spec re-application)
- Server-restart-resilient: when the *server* restarts (rather than
  client), all in-flight notifications are lost regardless of client
  state. Client treats this identically to its own disconnect and uses
  the resync path. The MCP server's `lastSyncId` is durably tracked
  per ADR 0001 §2.3; subscription state is durable via graph-resident
  `WAKE_SUBSCRIPTION` per Section 6.5; only the live-notification stream
  is volatile.

**At-least-once delivery semantics:**

If the client receives a notification but disconnects before persisting
`lastSeenLogId`, the same event may be re-delivered on resync (with a new
`eventId` but identical `logId`). Application-layer deduplication is the
recommended mitigation rather than transport-layer ack tracking:

- `wake/sent_to_me` events carry `messageId`; the agent dedupes by
  checking whether that messageId is already marked-read in its inbox
- `wake/task_state_changed` events carry immutable `sourceEventId`; the agent dedupes by that
  source identity rather than reconstructing identity from mutable `taskId` + `newState`
- `wake/permission_granted` events carry the edge identity; rare enough
  that re-processing is idempotent (re-checking a granted permission is
  harmless)

**Coalescing window during reconnect:** the OQ 6 throttle (Section 6.4)
applies to resync output. If reconnect happens after a long disconnect
(e.g., overnight), the resync query may return many events; the
coalescing window batches them into a single digest rather than firing
N separate notifications. Same path that protects against
burst-write thrashing during normal operation.

### 6.2 A2A Webhook Payload Shape (Shape B)

For harnesses providing an HTTP endpoint, wake events POST to the registered
URL. Body schema is identical to the MCP notification `data` field (Section
6.1.1-6.1.3) for consistency — same event types, same payload shapes, same
schema version.

#### 6.2.1 HTTP request

```
POST <subscription.harnessTargetMetadata.url>
Headers:
  Content-Type: application/json
  X-Neo-Wake-Signature: HMAC-SHA256(<body>, <subscription.harnessTargetMetadata.signingKey>)
  X-Neo-Wake-Event-Id: <ULID>
  X-Neo-Wake-Subscription-Id: WAKE_SUB:c0ffee01-…
  X-Neo-Wake-Schema-Version: 1.0
Body: <event-specific shape per 6.1.1-6.1.3>
```

#### 6.2.2 Retry semantics

- 2xx: event delivered, no retry
- 4xx: client error, no retry, subscription marked degraded
- 5xx / network error: exponential backoff (1s → 2s → 4s), max 3 retries
- After 3 consecutive failures across multiple events: subscription
  transitions to `harnessTarget: 'degraded'` until manual recovery via
  `manage_wake_subscription({action: 'update', ...})`

**Idempotency under retry:** the server's retry loop emits the *same*
`eventId` ULID across retry attempts (only the timestamp may shift). A typed source event also
retains its `sourceEventId`; neither identity is regenerated by retry. The webhook receiver SHOULD
dedupe retry attempts by `eventId` if it caches ack-state and dedupe source facts by
`sourceEventId`; otherwise application-layer dedup by subject ID (per the same discipline as
Shape A in §6.1.6) is sufficient.

**Client-driven catchup on prolonged outage:** webhook receivers that
sustain prolonged outage (e.g., harness offline overnight) recover via
the same `manage_wake_subscription({action: 'resync', ...})` path
described in §6.1.6 — the resync output simply re-fires through the
webhook rather than the MCP notification channel. Symmetric with Shape A.

#### 6.2.3 Signing

`signingKey` is generated by the server at subscription-creation time and
returned in the `manage_wake_subscription` response. Stored encrypted-at-rest
in the `WAKE_SUBSCRIPTION` node's `harnessTargetMetadata` (envelope
encryption deferred to multi-tenant transition under #9999; pre-#9999 the
secret lives plaintext in the per-tenant SQLite, which is the same trust
boundary as the rest of the data).

### 6.3 Wake Daemon Protocol (Shape C)

The wake daemon is a long-running process consuming the `GraphLog` delta
stream and emitting wake events to per-harness adapters.

#### 6.3.1 Daemon startup

Spawned alongside `swarm-heartbeat.sh` (or as its replacement in the
Phase 3 evolution). Reads:

- `WAKE_SUBSCRIPTION` nodes for all bound agent identities on this host
- Last-processed `lastSyncId` from a per-daemon state file
  (`.neo-ai-data/wake-daemon/lastSyncId`)

#### 6.3.2 Event loop

```
loop forever:
  delta = SQLite.getDeltaLog(lastSyncId)
  for entry in delta.invalidNodes ∪ delta.invalidEdges:
    matched_subscriptions = evaluateSubscriptions(entry, cached_WAKE_SUBSCRIPTIONs)
    for subscription in matched_subscriptions:
      coalesceQueue[subscription.id].push(entry)
  flushCoalesceQueue()  // per OQ 6 timer
  lastSyncId = delta.lastLogId
  sleep(daemonPollInterval)  // 1-5s typical
```

#### 6.3.3 Per-harness adapters

Each adapter receives the coalesced digest payload (Section 6.4) and emits
the wake to the harness's input surface:

**`adapter:tmux-shell`** (existing in `swarm-heartbeat.sh`):

```bash
tmux send-keys -t "<TMUX_SESSION>" "[WAKE] <digest>" C-m
```

**`adapter:osascript`** (Claude.app, Claude Desktop):

```bash
osascript -e 'tell application "Claude" to activate' \
  -e 'tell application "System Events" to keystroke "<digest>"' \
  -e 'tell application "System Events" to key code 36'  # Return
```

Requires Accessibility API permission granted by user. Fragile by virtue
of UI-automation; the OQ 1 forward path (Anthropic feature request for MCP
notification subscription) replaces this when implemented.

**`adapter:antigravity`** (when documented):

To be specified once Google publishes Agent Manager subprocess API. Until
then, Antigravity routes through Shape A or Shape B; wake daemon is not
the preferred path on that side.

#### 6.3.4 Co-existence with `syncCache`

The MCP server's `syncCache` and the wake daemon both consume the
`GraphLog` delta stream. Both are READ-ONLY consumers; they don't mutate
the log. Each tracks its own `lastSyncId` independently. Per OQ 5
(non-blocking pending), empirical verification of any cross-consumer
interference is part of the Shape C implementation sub-ticket.

### 6.4 Token-Economy Throttle (per OQ 6)

Wake events MUST NOT be 1:1 with the event stream at high velocity. Coalescing
applies symmetrically to all three Shapes.

#### 6.4.1 Coalescing window

- **Default:** 30 seconds
- **Configurable per subscription:** `harnessTargetMetadata.coalesceWindow`
  (in seconds; valid range 0-300; 0 = no coalescing, immediate delivery)
- **Bound:** maximum 5 minutes (300s) — beyond this, events stale enough
  that the agent's response would be on already-superseded state

#### 6.4.2 Digest format

When the coalesce timer fires with N ≥ 1 queued events:

```
[WAKE] <N> events for @<identity>: <breakdown>

Breakdown:
- <X> new messages (latest: "<subject>" from <sender>)
- <Y> task transitions (latest: <prevState> → <newState> on task <taskId>)
- <Z> permissions granted (latest: <scope> by <grantor>)

Subscription: <subscriptionId>
Window: <emittedAt - windowStart>
```

For Shape A (MCP notifications) and Shape B (A2A webhook), the digest goes in
the payload's `data` field with `eventType: "wake/digest"`. For Shape C
(wake daemon), the digest is the literal text injected via the harness
adapter.

### 6.5 Heartbeat-Bypass Detection (per OQ 7)

`swarm-heartbeat.sh` MUST consult the `WAKE_SUBSCRIPTION` table at startup
and per-cycle to determine which agent identities have active push
subscriptions. For those identities, heartbeat polling is skipped to avoid
duplicate wake injection.

#### 6.5.1 Detection logic

```bash
get_push_capable_identities() {
  # Returns identities with WAKE_SUBSCRIPTION.harnessTarget IN
  # ('mcp-notifications', 'a2a-webhook') AND status != 'degraded'
  sqlite3 "$DB_PATH" "
    SELECT json_extract(data, '\$.properties.agentIdentity')
    FROM Nodes
    WHERE json_extract(data, '\$.label') = 'WAKE_SUBSCRIPTION'
      AND json_extract(data, '\$.properties.harnessTarget') IN ('mcp-notifications', 'a2a-webhook')
      AND COALESCE(json_extract(data, '\$.properties.status'), 'active') != 'degraded';
  "
}
```

Per cycle, heartbeat skips polling for identities returned by the above query.
Identities with `harnessTarget: 'disabled' | 'none' | 'bridge-daemon'`
remain heartbeat-served (the daemon path is push-from-graph but
heartbeat-injected on Claude.app; not double-injection because the daemon
is what drives the heartbeat-equivalent for that identity).

#### 6.5.2 Long-term role of heartbeat

Per @neo-gemini-3-1-pro iteration 2 OQ 7: *"The heartbeat should eventually
be relegated to a pure system-level watchdog, not the primary message bus."*
Post-Phase-3, heartbeat retains:

- System-level watchdog for daemon health
- Fallback for `harnessTarget: 'disabled' | 'none'`
- Diagnostic-mode override during empirical-bisection sessions

It is no longer the primary wake mechanism for push-capable identities.

### 6.6 Subscription Management Tool Surface

The `manage_wake_subscription` MCP tool is the single client-facing surface
for subscription lifecycle. Server-side, it mutates the `WAKE_SUBSCRIPTION`
graph node + writes through the in-memory MCP server cache (per OQ 3
resolution in Discussion #10354).

#### 6.6.1 Tool surface

```
manage_wake_subscription({
  action: 'subscribe' | 'unsubscribe' | 'update' | 'list' | 'resync',

  // Required for unsubscribe / update / list (single) / resync:
  subscriptionId?: <uuid>,

  // Required for subscribe; optional for update:
  trigger?: 'SENT_TO_ME' | 'TASK_STATE_CHANGED' | 'PERMISSION_GRANTED',
  filters?: {
    taggedConcepts?: [<concept-id>, ...],
    priority?: 'high' | 'normal' | 'low',
    senderFilter?: [<identity>, ...],
    inReplyToFilter?: [<thread-root-id>, ...]
  },
  harnessTarget?: 'mcp-notifications' | 'a2a-webhook' | 'bridge-daemon' | 'disabled' | 'none',
  harnessTargetMetadata?: {
    url?: <webhook-url>,             // Shape B
    signingKey?: <opaque-string>,    // Shape B (returned by server on subscribe; rotated via update)
    coalesceWindow?: <seconds>,      // §6.4 override; null = use default
    daemonSocketPath?: <path>        // Shape C
  },

  // Required for resync only:
  sinceLogId?: <integer>            // GraphLog.log_id watermark; client-tracked
})
```

#### 6.6.2 Action semantics

| Action | Returns | Side-effect |
|---|---|---|
| `subscribe` | `{subscriptionId, harnessTarget, signingKey?}` | Creates `WAKE_SUBSCRIPTION` node + `SUBSCRIBES_TO` edge; writes to in-memory cache; for Shape B, generates and returns `signingKey` |
| `unsubscribe` | `{subscriptionId, status: 'removed'}` | Deletes the `WAKE_SUBSCRIPTION` node + edge; evicts from cache |
| `update` | `{subscriptionId, currentState}` | Mutates `WAKE_SUBSCRIPTION` properties; cache write-through |
| `list` | `{subscriptions: [...]}` | Returns all subscriptions for the bound agent identity (or one if `subscriptionId` provided) |
| `resync` | `{subscriptionId, eventsReplayed: <integer>, lastLogId: <integer>}` | Queries `GraphLog` from `sinceLogId` forward, applies current trigger+filter spec, re-emits matching events via the subscription's configured channel (MCP notifications / A2A webhook / wake daemon). Returns the count + the highest log_id reached so the client can update its `lastSeenLogId` watermark. |

#### 6.6.3 Authority + RBAC

The tool consults `RequestContextService.getAgentIdentityNodeId()` to
identify the calling agent. Subscriptions are personal by default —
agents can only manage their own. Future multi-agent shared subscriptions
(deferred per Discussion #10354 OQ 3 out-of-scope) would require a
permission scope (e.g., `CAN_MANAGE_SUBSCRIPTIONS_OF`) to grant
team-level visibility.

The `resync` action specifically respects RBAC: the re-emitted events
honor the same trigger + filter spec as live emissions, so an agent
cannot use resync as a privilege-escalation backdoor.

---

## 7. Positive Consequences

- **Closes Discussion #10354's final graduation gate** — Epic creation and
  Shape A/B/C sub-ticket filing unblocked.
- **Standards-aligned wake substrate** — extends our existing A2A Task
  envelope (#10334, #10342) alignment to the notification layer; aligns
  with MCP spec server-push primitives.
- **Cross-harness portable** — Shape D Hybrid accommodates Claude.app's
  current vendor-API gap via Shape C wake daemon while remaining
  forward-compatible with future MCP notification subscription (OQ 1
  Anthropic FR).
- **Token-economy preserved** — 30-60s coalescing window prevents wake
  thrashing under broadcast bursts or high-velocity Task transitions.
- **Restart-durable** — graph-resident `WAKE_SUBSCRIPTION` survives MCP
  server restart; agents don't re-subscribe at every boot.
- **Multi-tenant ready** — pre-#9999 ships single-tenant; substrate
  extends transparently when RLS engages via existing `userId` scoping.
- **Reuses existing primitives** — `GraphLog` + `syncCache` (per ADR 0001
  hardening) is the Shape C foundation; no new substrate invented.

---

## 8. Negative Consequences / Risks

- **Three-shape implementation surface.** The Hybrid architecture means
  three distinct code paths must be maintained. Mitigation: each shape
  is independently testable; Shape D detection logic has a single
  dispatching choice point.
- **Shape C `osascript` adapter fragility.** UI-automation depends on
  Accessibility API permission and is sensitive to Claude.app UI changes.
  Mitigation: forward path is Anthropic FR for native MCP notification
  subscription; Shape C is the bridge while that lands.
- **Coalescing-window default tuning.** 30-60s default may be wrong for
  some empirical patterns; per-subscription override mitigates but
  defaults need real-world observation. Mitigation: log coalesce-window
  hits per subscription; surface telemetry for empirical tuning.
- **Cross-consumer GraphLog reads.** MCP server's `syncCache` and bridge
  daemon both poll the delta stream. Per OQ 5 (non-blocking pending),
  empirical verification of cross-consumer interference happens in the
  Shape C implementation sub-ticket.
- **Webhook signing-key storage pre-#9999.** Shape B signing keys are
  plaintext-at-rest in the per-tenant SQLite pre-#9999. Trust boundary
  same as rest of substrate, but worth documenting. Envelope encryption
  follows the broader #9999 transition.

---

## 9. Alternatives Considered and Rejected (Summary)

| Option | Rejection reason |
|---|---|
| (E) Custom wake protocol | Reinvents A2A/MCP standards; ecosystem-incompat; training-data attractor |
| (F) Polling-only heartbeat | Latency floor + token economy; per OQ 7 retained as fallback only |
| (G) APNs / FCM vendor push | Cross-harness incompat; cloud-vendor coupling; wrong-substrate (end-user notification, not agent coordination) |
| (H) Standalone WebSocket | Collapses into A or B; new network surface without substrate gain |

---

## 10. References

### External standards

- [MCP Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25)
- [A2A Protocol Specification](https://a2a-protocol.org/latest/specification/)
- [A2A Streaming & Asynchronous Operations](https://a2a-protocol.org/latest/topics/streaming-and-async/)

### Source code (Phase 3 implementation will touch)

- `ai/services/memory-core/MailboxService.mjs` — addMessage / transitionTask emit points for `wake/*` events
- `ai/services/memory-core/GraphService.mjs` — `linkNodes` is the SENT_TO emit point for `wake/sent_to_me`
- `ai/graph/Database.mjs` — `syncCache` + `lastSyncId` pattern reused by Shape C wake daemon
- `ai/graph/storage/SQLite.mjs` — `GraphLog` triggers + `getDeltaLog` (Shape C foundation)
- `ai/scripts/swarm-heartbeat.sh` — `get_push_capable_identities` extension per Section 6.5

### Related tickets

- **Parent Epic:** #10311 (Phase 1 Swarm Autonomy → Phase 3 wake substrate sub-tree)
- **Substrate prerequisites (already merged):**
  - #10334 — A2A Task envelope primitive
  - #10342 — A2A state machine + transition authority
  - #10350 — TTL/Expired sweeper (Track 2C)
  - #10353 — GraphService transactional `linkNodes` + WAL cache-warm retry
- **This ADR:** #10355
- **Discussion ancestor:** #10354 (Phase 3 wake substrate ideation; this ADR is the final graduation gate)
- **Substrate cousin ADR:** ADR 0001 (`learn/agentos/decisions/0001-cross-process-cache-coherence.md`) — the `GraphLog` + `syncCache` primitives this ADR's Shape C builds on
- **Use-case unlock:** #10349 (Sunset Protocol self-DM handover) — `taggedConcepts: ['sunset-protocol-handover']` filter enables auto-discovery on boot

### Discussion #10354 iteration anchors

- Iteration 1 (filing): Empirical 5/6-layer stratification, four architectural shapes
- Iteration 2 (Gemini substrate review): Shape D consensus, OQs 6+7 RESOLVED_TO_AC
- Iteration 3 (Claude substrate-instinct): OQ 1 vendor probe, OQ 2 trigger primitives, OQ 3 graph-resident schema
- Iteration 3 review (Gemini concurrence): OQs 1, 2, 3 RESOLVED_TO_AC; `harnessTarget` enum extension to include `disabled`/`none`
- Iteration 4 (this ADR): graduation gate

### Empirical anchors from this session-arc

- Step 2 Task-lifecycle test: 7s substrate floor, 3.5s/transition, 0 anomalies
- Cross-harness wake confirmation: Gemini wrote "woke up to tobi" in human-visible chat after instruction received
- Layer 6 gap measured: 10m 34s human-postman delay vs 7s substrate cost
- A2A protocol production maturity: 150+ orgs as of April 2026 ([source](https://www.programming-helper.com/tech/agent-to-agent-protocol-2026-google-a2a-standard))
- MCP installation maturity: 97M+ installs as of March 2026 ([source](https://en.wikipedia.org/wiki/Model_Context_Protocol))

---

## Handoff Retrieval Hints

- `query_raw_memories(query="ADR 0002 phase 3 wake substrate standards alignment MCP notifications A2A webhook wake daemon")`
- `query_raw_memories(query="WAKE_SUBSCRIPTION manage_wake_subscription harnessTarget enum disabled none")`
- `query_raw_memories(query="token economy 30-60s coalescing window digest Layer 6 autonomous wake")`
- `query_summaries(query="Phase 3 wake substrate Discussion 10354 ADR 0002 Shape D hybrid")`
- Commit-range anchor: PR #10353 merged (substrate prerequisite) → Discussion #10354 filed → ADR 0002 (this)

Known contributing sessions:
- `48197e2e-3e95-47eb-9eb8-bbb032948845` — Phase 3 substrate validation (5/6 layers, Step 2 test, Discussion #10354 iterations 1-2)
- `52e84f76-2d4f-41cc-a42e-9d1d3fcaa381` — Discussion iterations 3-4, OQ 1 vendor probe, ADR 0002 drafting
- `b9be53b7-e7b6-4613-8bbf-48b8e88623a9` — Gemini's substrate-instinct review sessions (iterations 2 + 3)
