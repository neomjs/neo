import {generateLocalBearerToken, isLocalBearerToken} from '../../mcp/server/shared/helpers/localBearer.mjs';
import {normalizeAgentIdentityNodeId}                 from '../../graph/normalizeAgentIdentityNodeId.mjs';

/**
 * @module ai/services/fleet/fleetLaunchContract
 * @summary The Fleet launch path's three trust decisions — viewer binding, bearer intake, and
 * existing-process probing — as injectable, unit-testable seams the `devFleetServer` entry composes.
 *
 * The contract this module enforces: Fleet startup fails CLOSED unless the server-side viewer
 * resolves to one canonical, seeded `AgentIdentity` node (a bare login tag is not enough — an
 * unbound viewer cannot attribute admission, so it must not serve); the process bearer is either a
 * caller-supplied canonical value or freshly generated, and is never logged, persisted, or echoed;
 * and an already-listening Fleet process is only ever REUSED after proving "same token, same
 * viewer" through its authenticated probe — an unknown, stale, or mismatched process receives a
 * named refusal, never silent adoption (the shared-port trap: an instrument that cannot verify
 * which process it talks to will confidently steer the wrong one).
 */

/**
 * @summary Resolves the Fleet viewer's identity CLAIM — the graphless first half of viewer binding.
 *
 * Runs only the identity chain (env-var → gh CLI) and canonical node-id derivation; it deliberately
 * touches NO Memory Core surface. Plane-mode boot consumes this claim and lets the plane itself
 * verify it (the plane-side `list_permissions` proof binds the bearer's server-resolved subject to
 * this claim), so a missing or stale HOST graph can never veto a healthy configured plane. The
 * in-process mode composes this claim with the host-graph verification via
 * {@link resolveFleetViewer}.
 *
 * @param {Object}   [options]
 * @param {Function} [options.resolveIdentity] `() => Promise<{githubLogin, username, source}>` —
 *     defaults to the shared stdio resolver (env-var → gh CLI chain), lazily imported so tests
 *     inject without paying the Neo-class import.
 * @returns {Promise<{userId: String, username: String, agentIdentityNodeId: String, source: String}>}
 * @throws {Error} The named, remediation-bearing refusal for the unresolved case.
 */
export async function resolveFleetViewerClaim({resolveIdentity = null} = {}) {
    const resolve = resolveIdentity
        || (async () => (await import('../../mcp/server/shared/services/StdioIdentityResolver.mjs')).default.resolve());

    const identity = await resolve();

    if (!identity?.githubLogin) {
        throw new Error(
            '[fleet] startup refused: no viewer identity resolved. Set NEO_AGENT_IDENTITY to the ' +
            'operator\'s seeded handle (or authenticate the gh CLI) — the Fleet ingress stamps every ' +
            'admitted request with the server-resolved viewer and cannot serve without one.'
        )
    }

    return {
        userId             : identity.githubLogin,
        username           : identity.username || identity.githubLogin,
        agentIdentityNodeId: normalizeAgentIdentityNodeId(identity.githubLogin),
        source             : identity.source
    }
}

/**
 * @summary Resolves and BINDS the Fleet viewer at trusted server bootstrap — fail-closed.
 *
 * Composition mirrors the memory-core stdio boot (identity chain → canonical node id → seeded
 * graph-node verification) with one deliberate inversion: where memory-core treats a missing
 * graph node as single-tenant fallthrough, Fleet REFUSES to serve. The viewer identity is what
 * every admitted request gets stamped with; serving without a bound one would make admission
 * facts unattributable.
 *
 * This is the IN-PROCESS mode binding: the {@link resolveFleetViewerClaim} claim verified against
 * the host graph. Plane-mode boot uses the claim alone — its verification authority is the plane.
 *
 * @param {Object}   [options]
 * @param {Function} [options.resolveIdentity] Forwarded to {@link resolveFleetViewerClaim}.
 * @param {Function} [options.getGraphService] `() => Promise<{ready, getNode}>` — defaults to the
 *     memory-core GraphService, lazily imported per the established cross-process read pattern.
 * @returns {Promise<{userId: String, username: String, agentIdentityNodeId: String, source: String}>}
 * @throws {Error} Named, remediation-bearing refusals for the unresolved and unseeded cases.
 */
export async function resolveFleetViewer({resolveIdentity = null, getGraphService = null} = {}) {
    const claim = await resolveFleetViewerClaim({resolveIdentity});

    const nodeId  = claim.agentIdentityNodeId,
          service = getGraphService
              ? await getGraphService()
              : (await import('../memory-core/GraphService.mjs')).default;

    await service.ready();

    const node = await service.getNode({id: nodeId});

    if (node?.type !== 'AgentIdentity') {
        throw new Error(
            `[fleet] startup refused: resolved viewer '${claim.userId}' has no seeded ` +
            `AgentIdentity node ${nodeId}. The handle is stale, renamed, or unseeded — fix ` +
            'NEO_AGENT_IDENTITY or seed it via seedAgentIdentities.mjs. Serving without a bound ' +
            'viewer would make admission unattributable, so the Fleet ingress fails closed.'
        )
    }

    return {
        ...claim,
        agentIdentityNodeId: node.id
    }
}

/**
 * @summary Resolves the process-lifetime bearer: a caller-supplied canonical value wins, anything
 * malformed is REFUSED (a launcher that thinks it pinned the credential must not silently run on a
 * different one), absence generates fresh. The value is returned to the caller's memory and
 * nowhere else — no logging, no persistence, no environment mutation.
 *
 * @param {Object} [options]
 * @param {String} [options.suppliedToken] Candidate from the coordinating launcher (e.g. env intake).
 * @returns {String} A canonical 32-byte unpadded-base64url bearer.
 * @throws {TypeError} When a supplied candidate exists but is not canonical.
 */
export function resolveFleetBearer({suppliedToken = null} = {}) {
    if (suppliedToken !== null && suppliedToken !== undefined && suppliedToken !== '') {
        if (!isLocalBearerToken(suppliedToken)) {
            throw new TypeError(
                '[fleet] startup refused: NEO_FLEET_BEARER is set but not a canonical 32-byte ' +
                'unpadded-base64url token. A launcher that pinned a credential must not silently ' +
                'run on a different one — fix or unset it.'
            )
        }

        return suppliedToken
    }

    return generateLocalBearerToken()
}

/**
 * @summary Probes an already-listening Fleet endpoint for the reuse-or-refuse decision.
 *
 * Reuse requires BOTH proofs: the process accepts OUR bearer (same token — its guard rejects a
 * foreign one with 401), and it reports the SAME bound viewer (same identity — a matching token
 * with a different viewer is a stale or foreign launch). Anything else is a named refusal the
 * caller surfaces verbatim; silent adoption of an unverified process is the exact trap this
 * contract exists to close.
 *
 * @param {Object}   options
 * @param {String}   options.probeUrl            Absolute URL of the existing endpoint's `/fleet/probe`.
 * @param {String}   options.bearerToken         OUR process bearer.
 * @param {String}   options.agentIdentityNodeId OUR bound viewer node id.
 * @param {Function} [options.fetchImpl=globalThis.fetch]
 * @returns {Promise<Object>} `{reusable, reason}` on every path; reuse verdicts additionally carry
 *     `{viewer, pid}` from the incumbent's probe payload.
 */
export async function probeExistingFleetServer({probeUrl, bearerToken, agentIdentityNodeId, fetchImpl = globalThis.fetch}) {
    let response;

    try {
        response = await fetchImpl(probeUrl, {headers: {Authorization: `Bearer ${bearerToken}`}})
    } catch (error) {
        return {reusable: false, reason: `unreachable process on the Fleet port (${error.message}) — stop it or change NEO_FLEET_PORT`}
    }

    if (response.status === 401) {
        return {reusable: false, reason: 'a process on the Fleet port rejected our bearer — an UNKNOWN or stale Fleet (or foreign server) owns the port; refusing silent reuse'}
    }

    if (!response.ok) {
        return {reusable: false, reason: `a process on the Fleet port answered the probe with HTTP ${response.status} — not a healthy authenticated Fleet; refusing silent reuse`}
    }

    let payload;

    try {
        payload = await response.json()
    } catch {
        return {reusable: false, reason: 'a process on the Fleet port answered the probe with a non-JSON body — not a Fleet ingress; refusing silent reuse'}
    }

    const viewer = payload?.result?.agentIdentityNodeId;

    if (viewer !== agentIdentityNodeId) {
        return {reusable: false, reason: `the existing Fleet is bound to viewer '${viewer}' but this launch resolved '${agentIdentityNodeId}' — wrong-viewer process; refusing silent reuse`}
    }

    return {reusable: true, reason: 'same token, same viewer', viewer, pid: payload.result.pid}
}
