/**
 * @summary The app↔fleet wire-level capability allowlist — the EXACT method names a transport may
 * carry between the agentos pane and {@link Neo.ai.services.fleet.FleetControlBridge}. The single
 * shared source of truth for BOTH ends of the wire: the Node-side `dispatchFleetRequest` (which
 * rejects anything off this list) and the browser-side `createFleetRegistryBridge` (which generates
 * exactly these methods) — so the client can never call an operation the server won't route, and the
 * two ends cannot drift.
 *
 * Deliberately **narrower than FleetControlBridge's class surface**: it excludes the `getRegistry` /
 * `getManager` resolver seams (which return the lifecycle-powerful singletons) and every inherited
 * `Object` / `Neo.core.Base` member, so a crafted `{method:'getManager'}` / `{method:'constructor'}`
 * request cannot reach a non-operation.
 *
 * `getBootIdentity`, `fleetActivity`, `fleetHistory`, `fleetRoster`, and `fleetMailboxMirror` are **read-observe**
 * verbs — the advisory boot-identity fact, the bounded fleet activity snapshot, the assembled roster
 * cockpit DTO, and one agent's mailbox mirror: they carry NO lifecycle-write / restart authority. The
 * R3 read-observe ÷ lifecycle-write seam keeps the daemon-core restart actuator physically OFF this
 * client wire — only advisory reads ride it.
 *
 * `fleetMailboxMirror` carries no mutation verb and its snapshot is body-free. The transport it
 * rides is authenticated (Host/Origin/process-bearer gates) and every admitted request executes
 * under a SERVER-stamped viewer identity — the launch entry wires the source to resolve the bound
 * viewer from the request context per read, and admission stays the Memory Core primitive's own
 * fail-closed decision. An entry that has not composed the launch contract leaves the source
 * unwired, and every call answers an honest `unavailable`. Being on this list is what makes the
 * seam REAL rather than a Node-side method the browser can never name — an allowlist omission
 * fails closed and SILENT, which reads exactly like a wired-but-empty mailbox from the pane's side.
 *
 * `resolveViewerIdentity` is the **identity-bootstrap** read verb — whoami: it returns the
 * SERVER-stamped viewer identity (`{agentIdentityNodeId}`) from the authenticated request context,
 * never a caller claim. It exists because the mirror's explicit-subject contract is deliberate
 * (no self-defaulting at a trust boundary) while `admission.viewerIdentity` only arrives IN a read
 * result — circular for the FIRST own-inbox read. Whoami is the missing bootstrap leg of
 * "the client SAYS self, and the admission stamp proves it": cockpit calls whoami → passes the
 * returned @-id EXPLICITLY as `subjectAgentId` → the mirror re-stamps and proves it. An unwired
 * source (no composed launch contract) answers an honest `unavailable`; an admitted-but-unbound
 * context answers a named refusal — never a fallback identity.
 *
 * `markFleetCaughtUp` is a runtime-only write: it advances only the authenticated viewer's
 * process-lifetime `lastSeen` through an exact rendered window. It writes no graph, browser storage,
 * or durable digest. `composeOperatorMessage` is the wire's first durable **write** verb — the operator-mailbox steering
 * surface: compose a DM or an `AGENT:*` broadcast through the bridge's injected writer. It rides
 * ONLY the authenticated transport: the ingress stamps the server-resolved viewer into the request
 * context, and the mailbox primitive resolves the author + its principal class from that ambient
 * binding — the sender is never wire-carried, and caller-supplied identity fields never leave the
 * verb's payload whitelist.
 *
 * **Dependency-free by design** — imported by both a Node module and an App-Worker (browser) module,
 * so it MUST NOT pull in the Node-only FleetControlBridge / crypto / fs chain.
 * @type {String[]}
 */
export const FLEET_WIRE_METHODS = Object.freeze([
    'defineAgent', 'configureAgent', 'setRepo', 'setAvatar', 'listAgents', 'getAgent',
    'startAgent', 'stopAgent', 'restartAgent', 'removeAgent', 'fleetStatus', 'fleetRuntimeStatus',
    'getBootIdentity', 'fleetActivity', 'fleetHistory', 'fleetRoster', 'fleetMailboxMirror', 'connectTenant', 'listTenants',
    'composeOperatorMessage', 'markFleetCaughtUp', 'resolveViewerIdentity'
]);
