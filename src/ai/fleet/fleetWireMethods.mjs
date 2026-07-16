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
 * `getBootIdentity`, `fleetActivity`, and `fleetRoster` are **read-observe** verbs — the advisory
 * boot-identity fact, the bounded fleet activity snapshot, and the assembled roster cockpit DTO:
 * they carry NO lifecycle-write / restart authority. The R3 read-observe ÷ lifecycle-write seam
 * keeps the daemon-core restart actuator physically OFF this client wire — only advisory reads
 * ride it.
 *
 * **Dependency-free by design** — imported by both a Node module and an App-Worker (browser) module,
 * so it MUST NOT pull in the Node-only FleetControlBridge / crypto / fs chain.
 * @type {String[]}
 */
export const FLEET_WIRE_METHODS = Object.freeze([
    'defineAgent', 'configureAgent', 'setRepo', 'setAvatar', 'listAgents', 'getAgent',
    'startAgent', 'stopAgent', 'restartAgent', 'removeAgent', 'fleetStatus', 'fleetRuntimeStatus',
    'getBootIdentity', 'fleetActivity', 'fleetRoster', 'connectTenant', 'listTenants'
]);
