import FleetControlBridge from './FleetControlBridge.mjs';

/**
 * @module ai/services/fleet/wireOperatorComposeWriter
 * @summary Installs the operator-compose WRITE seam onto {@link Neo.ai.services.fleet.FleetControlBridge#composeWriter},
 * so the `composeOperatorMessage` wire verb can persist a mailbox message under the transport-stamped
 * request identity — the write-side sibling of `wireFleetActivityReadSource`, and the first write
 * seam on the fleet wire.
 *
 * **Read-at-use-site, mirroring the read-source wirings.** The caller (the fleet-server process
 * entry) lazily imports the MailboxService singleton at the boot use site and injects the bound
 * `addMessage`; this module never imports it, so the mailbox identity/permission binding stays at
 * the boundary. **The sender never crosses this seam:** `MailboxService.addMessage` resolves the
 * author and its server-stamped principal class from the ambient request context the authenticated
 * ingress bound — the writer carries payload, never identity.
 *
 * **Fail-soft:** no `addMessage` function → the seam is left unwired (`composeOperatorMessage`
 * answers its honest `not-wired` refusal), never a fabricated writer.
 *
 * @see ai/services/fleet/wireFleetActivityReadSource.mjs — the read-side shape precedent
 * @see ai/services/fleet/wireBootIdentityReadSource.mjs — the original wire-shape precedent
 */

/**
 * @summary Wire the operator-compose writer onto the fleet control bridge.
 * @param {Object}   options
 * @param {Function} [options.addMessage] MailboxService-compatible `addMessage(payload)`, bound by
 *     the caller (never imported here). Absent → the seam stays unwired.
 * @param {Object}   [options.bridge=FleetControlBridge] The control bridge to wire (a stub in specs).
 * @returns {Object|null} the installed writer, or `null` when no writer is available (left unwired).
 */
export function wireOperatorComposeWriter({addMessage, bridge = FleetControlBridge} = {}) {
    if (typeof addMessage !== 'function') {
        return null
    }

    bridge.composeWriter = {addMessage};

    return bridge.composeWriter
}
