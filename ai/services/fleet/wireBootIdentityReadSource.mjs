import FleetControlBridge             from './FleetControlBridge.mjs';
import {createBootIdentityReadSource} from './createBootIdentityReadSource.mjs';

/**
 * @module ai/services/fleet/wireBootIdentityReadSource
 * @summary Injects the cross-process boot-identity READER into `FleetControlBridge.bootIdentitySource`
 * at the fleet-bridge-server boot, so `getBootIdentity()` serves the orchestrator's advisory fact
 * (written to the shared runtime-state file by the orchestrator process) instead of the honest
 * advisory-`unknown` fallback. This is the composition point the read-observe seam always assumed but
 * nothing supplied — the fleet server and the orchestrator are separate processes in the dev (Option-B)
 * path, so the source is wired here, from the shared dir, rather than injected in-process.
 *
 * **Read-at-use-site.** The caller (the fleet-server process entry) reads
 * `AiConfig.orchestrator.dataDir` at the boot call and passes it in; this function owns no config
 * default and captures no leaf. **Fail-soft:** an absent/empty dir leaves `bootIdentitySource` unwired
 * (the seam keeps its honest advisory-`unknown`), never a fabricated source.
 */

/**
 * @summary Wire the boot-identity read-source onto the fleet control bridge.
 * @param {Object} options
 * @param {String} options.dir The shared runtime-state directory the orchestrator writes the fact to
 *     (read from `AiConfig.orchestrator.dataDir` at the caller's boot use site).
 * @param {Number} [options.maxAgeMs] Staleness horizon forwarded to the read-source; omit for the
 *     store default. Threaded so the fleet-server boot can tighten/relax the horizon from config.
 * @param {Object} [options.bridge=FleetControlBridge] The control bridge to wire (a stub in specs).
 * @param {Function} [options.createSource=createBootIdentityReadSource] The read-source factory (injected in specs).
 * @returns {Object|null} the wired read-source, or `null` when no dir was supplied (left unwired).
 */
export function wireBootIdentityReadSource({dir, maxAgeMs, bridge = FleetControlBridge, createSource = createBootIdentityReadSource} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        return null; // no shared dir → leave the seam unwired (honest advisory-unknown), never fabricate a source
    }

    bridge.bootIdentitySource = createSource({dir, maxAgeMs});

    return bridge.bootIdentitySource;
}
