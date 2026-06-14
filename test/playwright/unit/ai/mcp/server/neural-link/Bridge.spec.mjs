import {setup} from '../../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'BridgeHandshakeAuthTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import crypto         from 'crypto';

import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import Bridge    from '../../../../../../../ai/mcp/server/neural-link/Bridge.mjs';

const {privateKey, publicKey} = crypto.generateKeyPairSync('ed25519');

// Sign a token the way FleetRegistryService.mintBridgeToken does (Ed25519 over the payload bytes).
const sign = (agentId, expiresAt = Date.now() + 3_600_000) => {
    const p = Buffer.from(JSON.stringify({agentId, expiresAt}));
    return `${p.toString('base64url')}.${crypto.sign(null, p, privateKey).toString('base64url')}`;
};

// A minimal WebSocket stand-in — handleConnection / registerAgent only touch close / on / send / readyState.
const makeWs  = () => ({readyState: 1, closed: null, sent: [], on() {}, send(d) {this.sent.push(d)}, close(code, reason) {this.closed = {code, reason}}, terminate() {}});
const makeReq = query => ({url: `/?${query}`, headers: {host: '127.0.0.1:8081'}});

test.describe('Bridge.handleConnection — agent handshake auth (#13172)', () => {
    test.beforeEach(() => {
        // isolate the singleton's connection maps + configure fleet mode (a verify key is present)
        Bridge.agents          = new Map();
        Bridge.apps            = new Map();
        Bridge.bridgePublicKey = publicKey;
    });

    test('SECURITY: a valid token binds the SIGNED agentId, ignoring a spoofed ?id=', () => {
        const ws = makeWs();
        Bridge.handleConnection(ws, makeReq(`role=agent&id=agent-b&token=${sign('agent-a')}`));

        expect(Bridge.agents.has('agent-a')).toBe(true);  // the signature decides identity
        expect(Bridge.agents.has('agent-b')).toBe(false); // the spoofed ?id= claim is ignored
        expect(ws.closed).toBe(null);
    });

    test('SECURITY: a missing / malformed / expired token closes 1008 and registers nothing', () => {
        const bad = [
            'role=agent&id=agent-a',                                          // missing token
            'role=agent&id=agent-a&token=not-a-token',                        // malformed
            `role=agent&id=agent-a&token=${sign('agent-a', Date.now() - 1)}`, // expired
            `role=agent&id=agent-a&token=${sign('agent-a').slice(0, -4)}AAAA` // tampered signature
        ];
        for (const q of bad) {
            Bridge.agents = new Map();
            const ws = makeWs();
            Bridge.handleConnection(ws, makeReq(q));
            expect(ws.closed?.code).toBe(1008);
            expect(Bridge.agents.size).toBe(0);
        }
    });

    test('the app / default connection path is unaffected by agent auth', () => {
        const ws = makeWs();
        Bridge.handleConnection(ws, makeReq('id=app-1&appName=Colors')); // no role → app
        expect(Bridge.apps.has('app-1')).toBe(true);
        expect(ws.closed).toBe(null);
    });

    test('no configured key → legacy unauthenticated path registers the ?id= claim (no-FM dev)', () => {
        Bridge.bridgePublicKey = null;
        const ws = makeWs();
        Bridge.handleConnection(ws, makeReq('role=agent&id=legacy-agent'));
        expect(Bridge.agents.has('legacy-agent')).toBe(true);
        expect(ws.closed).toBe(null);
    });
});
