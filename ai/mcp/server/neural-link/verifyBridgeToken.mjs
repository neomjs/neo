import crypto from 'crypto';

/**
 * @summary Verify a signed Neural-Link Bridge token; return the SIGNED agentId or null (fail-closed).
 *
 * Pure + Bridge-free (mirrors `src/ai/parseAgentEnvelope.mjs`) so the security gate is unit-testable
 * without the WebSocket singleton. The token is the FM-minted `<base64url(payload)>.<base64url(sig)>`
 * (`Neo.ai.services.fleet.FleetRegistryService.mintBridgeToken`): an Ed25519 signature over the exact
 * `{agentId, expiresAt}` payload bytes. The identity is taken from the **verified** payload, never
 * from any connection-supplied `?id=` claim — closing the raw-claim spoofing path.
 *
 * Returns null on: a missing public key (no fleet auth configured → caller falls back to legacy
 * unauthenticated mode), a non-string / malformed token, a bad or forged signature, an expired or
 * malformed payload, or any thrown error. Never throws.
 *
 * @param {String}      token     `<base64url(payload)>.<base64url(signature)>`.
 * @param {Object|null} publicKey The Ed25519 verify key (a `crypto.KeyObject`), or null/undefined.
 * @returns {String|null} the verified agentId, or null.
 */
export function verifyBridgeToken(token, publicKey) {
    try {
        if (!publicKey || typeof token !== 'string') return null;

        const dot = token.indexOf('.');
        if (dot < 1) return null;

        const
            payload   = Buffer.from(token.slice(0, dot), 'base64url'),
            signature = Buffer.from(token.slice(dot + 1), 'base64url');

        // Ed25519 verify over the exact signed payload bytes; a forged or altered token → false.
        if (!crypto.verify(null, payload, publicKey, signature)) return null;

        const {agentId, expiresAt} = JSON.parse(payload.toString('utf8'));

        if (typeof agentId !== 'string'  || !agentId)                return null;
        if (typeof expiresAt !== 'number' || Date.now() >= expiresAt) return null;

        return agentId;
    } catch {
        return null;
    }
}
