import {test, expect}      from '@playwright/test';
import crypto              from 'crypto';
import {verifyBridgeToken} from '../../../../../../../ai/mcp/server/neural-link/verifyBridgeToken.mjs';

// The Bridge's stateless security gate. Pure — imported directly (no WebSocket singleton),
// mirroring src/ai/parseAgentEnvelope.spec. A keypair stands in for the FM signer / Bridge verifier.
const {privateKey, publicKey} = crypto.generateKeyPairSync('ed25519');

// Mint a token the way FleetRegistryService.mintBridgeToken does: Ed25519 over the payload bytes.
const mint = (agentId, expiresAt = Date.now() + 3_600_000) => {
    const payload = Buffer.from(JSON.stringify({agentId, expiresAt}));
    return `${payload.toString('base64url')}.${crypto.sign(null, payload, privateKey).toString('base64url')}`;
};

test.describe('verifyBridgeToken (Neural Link Bridge auth gate)', () => {
    test('a valid token returns the SIGNED agentId', () => {
        expect(verifyBridgeToken(mint('agent-x'), publicKey)).toBe('agent-x');
    });

    test('fail-closed: no public key (legacy / unauth mode) → null', () => {
        expect(verifyBridgeToken(mint('agent-x'), null)).toBe(null);
        expect(verifyBridgeToken(mint('agent-x'), undefined)).toBe(null);
    });

    test('fail-closed: a non-string or malformed token → null', () => {
        for (const bad of [undefined, null, 42, {}, '', 'no-dot', '.onlysig']) {
            expect(verifyBridgeToken(bad, publicKey)).toBe(null);
        }
    });

    test('SECURITY: a tampered payload (claim a different agentId) → null', () => {
        const [, sigB64] = mint('victim').split('.');
        const forged = Buffer.from(JSON.stringify({agentId: 'attacker', expiresAt: Date.now() + 1e6})).toString('base64url');
        expect(verifyBridgeToken(`${forged}.${sigB64}`, publicKey)).toBe(null);
    });

    test('SECURITY: a tampered signature → null', () => {
        const [payloadB64, sigB64] = mint('agent-x').split('.');
        expect(verifyBridgeToken(`${payloadB64}.${sigB64.slice(0, -4)}AAAA`, publicKey)).toBe(null);
    });

    test('SECURITY: a token signed by a DIFFERENT key → null (cannot forge without the private key)', () => {
        const other   = crypto.generateKeyPairSync('ed25519'),
              p       = Buffer.from(JSON.stringify({agentId: 'agent-x', expiresAt: Date.now() + 1e6})),
              foreign = `${p.toString('base64url')}.${crypto.sign(null, p, other.privateKey).toString('base64url')}`;
        expect(verifyBridgeToken(foreign, publicKey)).toBe(null);
    });

    test('fail-closed: an expired token → null', () => {
        expect(verifyBridgeToken(mint('agent-x', Date.now() - 1), publicKey)).toBe(null);
    });

    test('fail-closed: a malformed payload (missing / wrong-typed agentId or expiresAt) → null', () => {
        const sign = obj => {
            const p = Buffer.from(JSON.stringify(obj));
            return `${p.toString('base64url')}.${crypto.sign(null, p, privateKey).toString('base64url')}`;
        };
        expect(verifyBridgeToken(sign({expiresAt: Date.now() + 1e6}),             publicKey)).toBe(null); // no agentId
        expect(verifyBridgeToken(sign({agentId: '',  expiresAt: Date.now() + 1e6}), publicKey)).toBe(null); // empty agentId
        expect(verifyBridgeToken(sign({agentId: 'x'}),                            publicKey)).toBe(null); // no expiresAt
        expect(verifyBridgeToken(sign({agentId: 'x', expiresAt: 'soon'}),         publicKey)).toBe(null); // non-number expiry
    });
});
