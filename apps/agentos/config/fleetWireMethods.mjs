/**
 * The app↔fleet wire-method vocabulary — the Body-side TWIN of the Brain authority
 * (`ai/services/fleet/fleetWireMethods.mjs`). The browser-side `createFleetRegistryBridge`
 * generates EXACTLY these proxy methods; the Node-side `dispatchFleetRequest` validates against
 * the authority list — and `ai/scripts/lint/lint-fleet-vocabulary-parity.mjs` deep-equals the two,
 * so the ends of the wire cannot drift. A new verb is ONE registration in the authority,
 * mirrored here in the same commit; the semantic contract of every verb (read-observe vs write,
 * credential classification, the R3 seam) is documented ON the authority module, not duplicated
 * here.
 * @summary Operable-cold wire-method twin: the browser's proxy-generation list.
 */

/**
 * @type {String[]}
 */
export const FLEET_WIRE_METHODS = Object.freeze([
    'defineAgent', 'configureAgent', 'setRepo', 'setAvatar', 'listAgents', 'getAgent',
    'startAgent', 'stopAgent', 'restartAgent', 'removeAgent', 'fleetStatus', 'fleetRuntimeStatus',
    'getBootIdentity', 'fleetActivity', 'fleetHistory', 'fleetMemories', 'fleetRoster', 'fleetMailboxMirror', 'connectTenant', 'listTenants',
    'composeOperatorMessage', 'markFleetCaughtUp', 'resolveViewerIdentity', 'fleetWakeRoutes'
]);

/**
 * @summary The wire verbs whose normal payload includes credential bytes — the preload-ingress
 * classification the packaged Electron shell consumes. Derived exactly as the authority derives it.
 * @type {String[]}
 */
export const FLEET_CREDENTIAL_METHODS = Object.freeze(
    FLEET_WIRE_METHODS.filter(method => method === 'defineAgent' || method === 'connectTenant')
);
