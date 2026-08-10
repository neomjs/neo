import fs                    from 'fs';
import path                  from 'path';
import {createHash}          from 'crypto';
import {writeFileAtomicSync} from '../../../../services/shared/atomicFileWrite.mjs';
import {
    generateLocalBearerToken,
    isLocalBearerToken
} from './localBearer.mjs';

/**
 * @summary Pure seat-token primitives — the request-time subject-binding transfer of the
 * window-identity spine contract: minted for one exact consumer, bound on first use,
 * generation-invalidated on regeneration, stale outcomes reported honestly.
 *
 * The registry is the mint-side artifact: the seat-config generator (a host CLI — a
 * non-entrypoint that must not import Neo singletons, which is why every function here is
 * pure with injectable paths and no Neo import; ticket-ref-ok: ADR 0019 C1 defines that
 * non-entrypoint constraint) writes ONE registry per plane; the server's auth verifier reads it. A registry
 * carries `planeId` and `generation` at the top level, so regenerating seat configs rewrites
 * the row set wholesale — generation invalidation by construction, never by mutation. One
 * previous generation's hashes are retained so a stale token rejects as `stale-generation`
 * rather than dishonestly claiming `unknown-token`.
 *
 * Token format reuses the canonical 32-byte unpadded-base64url primitives from
 * `localBearer.mjs`; only SHA-256 hashes ever enter the registry — the raw token exists in
 * exactly two places: the generated seat config (generator-private, the `opaqueHandleKey`
 * discipline) and the presenting client's Authorization header.
 */

/**
 * @summary Hashes a seat token for registry storage/lookup — raw tokens never persist.
 * @param {String} token Canonical seat token.
 * @returns {String} SHA-256 hex digest.
 */
export function hashSeatToken(token) {
    return createHash('sha256').update(token).digest('hex')
}

/**
 * @summary Mints one seat token + its registry row (generator-side).
 * @param {Object} options
 * @param {String} options.agentIdentityNodeId Canonical `AGENT_IDENTITY:@…` graph node id the token binds to.
 * @param {String} [options.now] ISO timestamp override, injectable for tests.
 * @returns {{token: String, row: Object}} The RAW token (for the seat config only) + the hash-only registry row.
 */
export function mintSeatToken({agentIdentityNodeId, now = new Date().toISOString()}) {
    if (typeof agentIdentityNodeId !== 'string' || agentIdentityNodeId.length === 0) {
        throw new Error('seatToken.mintSeatToken: agentIdentityNodeId is required — a seat token without a subject is possession-only, the exact gap this contract closes.');
    }
    const token = generateLocalBearerToken();

    return {
        token,
        row: {
            tokenHash: hashSeatToken(token),
            agentIdentityNodeId,
            mintedAt : now
        }
    }
}

/**
 * @summary Builds a complete registry document for one plane + generation.
 *
 * Regeneration passes the PRIOR registry so its row hashes are retained as
 * `previousGenerationHashes` — the honest `stale-generation` rejection substrate.
 * @param {Object} options
 * @param {String} options.planeId Opaque plane identity the registry admits to.
 * @param {Number} options.generation Monotonic seat-config generation counter.
 * @param {Object[]} options.rows Registry rows from `mintSeatToken`.
 * @param {Object} [options.previousRegistry] The prior generation's registry document.
 * @returns {Object} Frozen registry document.
 */
export function buildSeatTokenRegistry({planeId, generation, rows, previousRegistry = null}) {
    if (typeof planeId !== 'string' || planeId.length === 0) {
        throw new Error('seatToken.buildSeatTokenRegistry: planeId is required — admission is plane-scoped by contract.');
    }
    if (!Number.isInteger(generation) || generation < 1) {
        throw new Error('seatToken.buildSeatTokenRegistry: generation must be a positive integer.');
    }
    if (previousRegistry && previousRegistry.generation >= generation) {
        throw new Error(`seatToken.buildSeatTokenRegistry: generation ${generation} must exceed the previous registry's ${previousRegistry.generation}.`);
    }

    return Object.freeze({
        planeId,
        generation,
        rows                    : Object.freeze(rows.map(row => Object.freeze({...row}))),
        previousGenerationHashes: Object.freeze(previousRegistry ? previousRegistry.rows.map(row => row.tokenHash) : [])
    })
}

/**
 * @summary Verifies one presented seat token against a registry, plane-scoped.
 *
 * Pure classification — the auth seam owns error types and session binding. Outcomes:
 * - `{ok: true, row}` — current-generation token; `row.agentIdentityNodeId` is the subject.
 * - `{ok: false, reason: 'malformed-token'}` — not a canonical token; never touches the registry.
 * - `{ok: false, reason: 'wrong-plane'}` — the registry admits a different `planeId` than the
 *   server's declared plane: a seat admitted to an overlay must not present against the durable
 *   plane (fail closed, named).
 * - `{ok: false, reason: 'stale-generation'}` — the token belonged to the retained previous
 *   generation; regeneration invalidated it (honest staleness, the precedent's reload analog).
 * - `{ok: false, reason: 'unknown-token'}` — no current or retained hash matches.
 * @param {Object} options
 * @param {String} options.token Presented bearer token.
 * @param {Object} options.registry Registry document from `readSeatTokenRegistry`.
 * @param {String} options.planeId The server's RESOLVED plane identity (`aiConfig.plane.id`).
 * @returns {{ok: Boolean, row: (Object|undefined), reason: (String|undefined)}}
 */
export function verifySeatToken({token, registry, planeId}) {
    if (!isLocalBearerToken(token)) {
        return {ok: false, reason: 'malformed-token'}
    }
    if (registry.planeId !== planeId) {
        return {ok: false, reason: 'wrong-plane'}
    }

    const tokenHash = hashSeatToken(token);
    const row       = registry.rows.find(candidate => candidate.tokenHash === tokenHash);

    if (row) {
        return {ok: true, row}
    }
    if (registry.previousGenerationHashes.includes(tokenHash)) {
        return {ok: false, reason: 'stale-generation'}
    }
    return {ok: false, reason: 'unknown-token'}
}

/**
 * @summary Reads and validates a registry document — fail loud, never a silent empty fallback:
 * an unreadable registry on a server that REQUIRES seat tokens is an auth outage, not a default.
 * @param {String} filePath Absolute registry path (a plane member — derives from the plane anchor).
 * @returns {Object} Parsed registry document.
 */
export function readSeatTokenRegistry(filePath) {
    const raw    = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (typeof parsed.planeId !== 'string' || !Number.isInteger(parsed.generation) ||
        !Array.isArray(parsed.rows) || !Array.isArray(parsed.previousGenerationHashes)) {
        throw new Error(`seatToken.readSeatTokenRegistry: "${filePath}" is not a valid seat-token registry document.`);
    }
    return parsed
}

/**
 * @summary Atomically writes a registry document (tmp + rename — a half-written registry must
 * never be readable as an auth source).
 * @param {String} filePath Absolute registry path.
 * @param {Object} registry Registry document from `buildSeatTokenRegistry`.
 * @returns {void}
 */
export function writeSeatTokenRegistry(filePath, registry) {
    // The former scratch name was `${filePath}.tmp-${process.pid}` — unique across processes but NOT
    // across concurrent writers inside one, which is exactly the shape this registry sees. The
    // primitive's pid+UUID scratch closes that, and adds the cleanup this never had.
    writeFileAtomicSync(filePath, JSON.stringify(registry, null, 4) + '\n')
}
