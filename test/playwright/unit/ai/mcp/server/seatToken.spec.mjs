import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import '../../../../../../src/Neo.mjs';
import '../../../../../../src/core/_export.mjs';
import AuthService from '../../../../../../ai/mcp/server/shared/services/AuthService.mjs';
import {
    buildSeatTokenRegistry,
    hashSeatToken,
    mintSeatToken,
    readSeatTokenRegistry,
    verifySeatToken,
    writeSeatTokenRegistry
} from '../../../../../../ai/mcp/server/shared/helpers/seatToken.mjs';

const SUBJECT = 'AGENT_IDENTITY:@neo-test-seat';

function mintedRegistry({planeId = 'overlay-seat-spec', generation = 1, previousRegistry = null} = {}) {
    const {token, row} = mintSeatToken({agentIdentityNodeId: SUBJECT});
    const registry     = buildSeatTokenRegistry({planeId, generation, rows: [row], previousRegistry});

    return {token, row, registry}
}

test.describe('seatToken — the window-identity spine transfer, pure layer (#15801)', () => {
    test('mint requires a subject and produces distinct raw tokens with hash-only rows', () => {
        expect(() => mintSeatToken({agentIdentityNodeId: ''})).toThrow('possession-only');

        const first  = mintSeatToken({agentIdentityNodeId: SUBJECT});
        const second = mintSeatToken({agentIdentityNodeId: SUBJECT});

        expect(first.token).not.toBe(second.token);
        expect(first.row.tokenHash).toBe(hashSeatToken(first.token));
        expect(JSON.stringify(first.row)).not.toContain(first.token)
    });

    test('a current-generation token verifies to its ONE bound subject', () => {
        const {token, registry} = mintedRegistry();
        const outcome           = verifySeatToken({token, registry, planeId: 'overlay-seat-spec'});

        expect(outcome.ok).toBe(true);
        expect(outcome.row.agentIdentityNodeId).toBe(SUBJECT)
    });

    test('admission is plane-scoped: presenting against a different declared plane fails closed, named', () => {
        const {token, registry} = mintedRegistry();
        const outcome           = verifySeatToken({token, registry, planeId: 'neo-local-canonical'});

        expect(outcome).toEqual({ok: false, reason: 'wrong-plane'})
    });

    test('regeneration invalidates: the prior generation rejects as stale-generation, honestly named', () => {
        const gen1 = mintedRegistry();
        const gen2 = mintedRegistry({generation: 2, previousRegistry: gen1.registry});

        expect(verifySeatToken({token: gen2.token, registry: gen2.registry, planeId: 'overlay-seat-spec'}).ok).toBe(true);
        expect(verifySeatToken({token: gen1.token, registry: gen2.registry, planeId: 'overlay-seat-spec'}))
            .toEqual({ok: false, reason: 'stale-generation'});

        expect(() => buildSeatTokenRegistry({planeId: 'overlay-seat-spec', generation: 2, rows: [], previousRegistry: gen2.registry}))
            .toThrow('must exceed')
    });

    test('fail-closed classification: malformed and unknown tokens never resolve a subject', () => {
        const {registry} = mintedRegistry();

        expect(verifySeatToken({token: 'not-a-token', registry, planeId: 'overlay-seat-spec'}))
            .toEqual({ok: false, reason: 'malformed-token'});
        expect(verifySeatToken({token: mintSeatToken({agentIdentityNodeId: SUBJECT}).token, registry, planeId: 'overlay-seat-spec'}))
            .toEqual({ok: false, reason: 'unknown-token'})
    });

    test('registry I/O: atomic write + validated read roundtrip; malformed documents fail loud', () => {
        const dir      = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-seat-token-spec-'));
        const filePath = path.join(dir, 'nested', 'seat-tokens.json');

        try {
            const {token, registry} = mintedRegistry();

            writeSeatTokenRegistry(filePath, registry);

            const restored = readSeatTokenRegistry(filePath);
            expect(verifySeatToken({token, registry: restored, planeId: 'overlay-seat-spec'}).ok).toBe(true);
            expect(fs.readdirSync(path.dirname(filePath)).filter(name => name.includes('.tmp-')).length).toBe(0);

            fs.writeFileSync(filePath, '{"planeId": "x"}', 'utf8');
            expect(() => readSeatTokenRegistry(filePath)).toThrow('not a valid seat-token registry')
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    });
});

test.describe('AuthService seat-token mode — the verifier over a real registry (#15801)', () => {
    class FakeInvalidTokenError extends Error {}

    const silentLogger = {info: () => {}};

    function writtenRegistry(dir, {planeId = 'overlay-auth-spec', generation = 1, previousRegistry = null} = {}) {
        const {token, row} = mintSeatToken({agentIdentityNodeId: SUBJECT});
        const registry     = buildSeatTokenRegistry({planeId, generation, rows: [row], previousRegistry});
        const filePath     = path.join(dir, 'registry.json');

        writeSeatTokenRegistry(filePath, registry);
        return {token, registry, filePath}
    }

    function makeVerifier(filePath, planeId) {
        return AuthService.createSeatTokenVerifier({
            aiConfig         : {auth: {seatTokenRegistryPath: filePath}, plane: {id: planeId}},
            logger           : silentLogger,
            InvalidTokenError: FakeInvalidTokenError
        })
    }

    test('setup fails loud when the registry is unreadable — a required registry is a boot gate, not a 401', () => {
        expect(() => makeVerifier('/nonexistent/seat-tokens/registry.json', 'overlay-auth-spec')).toThrow()
    });

    test('a verified token resolves its minted subject: login-shaped userId + the graph node id', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-seat-auth-spec-'));

        try {
            const {token, filePath} = writtenRegistry(dir);
            const info              = await makeVerifier(filePath, 'overlay-auth-spec').verifyAccessToken(token);

            expect(info.userId).toBe('neo-test-seat');
            expect(info.agentIdentityNodeId).toBe(SUBJECT);
            expect(info.source).toBe('seat-token')
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    });

    test('rejections carry their named classification, plane scoping included', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-seat-auth-spec-'));

        try {
            const {token, filePath} = writtenRegistry(dir);
            const verifier          = makeVerifier(filePath, 'neo-local-canonical');

            await expect(verifier.verifyAccessToken(token)).rejects.toThrow('wrong-plane')
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    });

    test('LIVE regeneration invalidates without a restart: the mtime reload serves the new generation', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-seat-auth-spec-'));

        try {
            const gen1     = writtenRegistry(dir);
            const verifier = makeVerifier(gen1.filePath, 'overlay-auth-spec');

            expect((await verifier.verifyAccessToken(gen1.token)).userId).toBe('neo-test-seat');

            const gen2 = writtenRegistry(dir, {generation: 2, previousRegistry: gen1.registry});
            const bump = new Date(Date.now() + 2000);
            fs.utimesSync(gen2.filePath, bump, bump);

            await expect(verifier.verifyAccessToken(gen1.token)).rejects.toThrow('stale-generation');
            expect((await verifier.verifyAccessToken(gen2.token)).userId).toBe('neo-test-seat')
        } finally {
            fs.rmSync(dir, {recursive: true, force: true})
        }
    });
});
