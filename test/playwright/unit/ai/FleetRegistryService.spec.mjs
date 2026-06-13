import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'FleetRegistryServiceTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import fs              from 'fs';
import os              from 'os';
import path            from 'path';

import Neo                  from '../../../../src/Neo.mjs';
import * as core            from '../../../../src/core/_export.mjs';
import FleetRegistryService from '../../../../ai/services/fleet/FleetRegistryService.mjs';

const createdDirs = [];

/**
 * Create + track a unique temp dir under the OS temp root. Race-free across Playwright's parallel
 * workers — there is no shared on-disk scratch dir for a sibling test's teardown to delete.
 * @param {String} [prefix='neo-fleet-registry-']
 * @returns {String} the new directory
 */
function makeDir(prefix='neo-fleet-registry-') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    createdDirs.push(dir);
    return dir;
}

/**
 * Point the singleton at a fresh, isolated data dir (its own keyfile + stores) for a test.
 * @returns {String} the fresh directory
 */
function freshDataDir() {
    const dir = makeDir();
    FleetRegistryService.dataDir = dir;
    return dir;
}

test.describe('Neo.ai.services.fleet.FleetRegistryService', () => {
    test.beforeEach(() => {
        freshDataDir();
    });

    test.afterEach(() => {
        while (createdDirs.length) {
            const dir = createdDirs.pop();
            if (fs.existsSync(dir)) fs.rmSync(dir, {recursive: true, force: true});
        }
    });

    test('defineAgent captures githubUsername + harnessType and echoes no secret', () => {
        const def = FleetRegistryService.defineAgent({
            githubUsername: 'neo-claude-opus',
            harnessType   : 'claude-desktop',
            credential    : 'ghp_secretTokenAAA'
        });

        expect(def.githubUsername).toBe('neo-claude-opus');
        expect(def.harnessType).toBe('claude-desktop');
        expect(def.id).toBe('neo-claude-opus');
        expect(def.credential).toBeUndefined();
        expect(JSON.stringify(def)).not.toContain('ghp_secretTokenAAA');
    });

    test('CRUD round-trip: define -> list -> get -> remove', () => {
        FleetRegistryService.defineAgent({githubUsername: 'agent-a', harnessType: 'codex',       credential: 'ghp_a'});
        FleetRegistryService.defineAgent({githubUsername: 'agent-b', harnessType: 'antigravity', credential: 'ghp_b'});

        const list = FleetRegistryService.listAgents();
        expect(list).toHaveLength(2);
        expect(list.map(a => a.id).sort()).toEqual(['agent-a', 'agent-b']);

        expect(FleetRegistryService.getAgent('agent-a').harnessType).toBe('codex');

        const removed = FleetRegistryService.removeAgent('agent-a');
        expect(removed.success).toBe(true);
        expect(FleetRegistryService.getAgent('agent-a')).toBeNull();
        expect(FleetRegistryService.listAgents()).toHaveLength(1);
    });

    test('SECURITY BOUNDARY: the PAT is never returned by getAgent / listAgents; only resolveCredential serves it', () => {
        const pat = 'ghp_BoundaryToken_1234567890';
        FleetRegistryService.defineAgent({githubUsername: 'secure-agent', harnessType: 'claude-desktop', credential: pat});

        const got  = FleetRegistryService.getAgent('secure-agent'),
              list = FleetRegistryService.listAgents();

        expect(JSON.stringify(got)).not.toContain(pat);
        expect(JSON.stringify(list)).not.toContain(pat);
        expect(got.credential).toBeUndefined();
        expect(got.pat).toBeUndefined();

        // the dedicated Brain-internal accessor is the ONLY path to the raw PAT
        expect(FleetRegistryService.resolveCredential('secure-agent')).toBe(pat);
    });

    test('SECURITY BOUNDARY: the credential is encrypted at rest; registry.json holds no plaintext PAT', () => {
        const pat = 'ghp_AtRestToken_ABCDEFGH';
        FleetRegistryService.defineAgent({githubUsername: 'disk-agent', harnessType: 'codex', credential: pat});

        const dir         = FleetRegistryService.dataDir,
              registryRaw = fs.readFileSync(path.join(dir, 'registry.json'),   'utf8'),
              credsRaw    = fs.readFileSync(path.join(dir, 'credentials.enc'), 'utf8');

        // the definitions file is plaintext but must never contain the secret
        expect(registryRaw).toContain('disk-agent');
        expect(registryRaw).not.toContain(pat);
        // the credential file is ciphertext: the raw PAT must not appear
        expect(credsRaw).not.toContain(pat);
    });

    test('persists across a reload (durable on disk + decrypts back)', () => {
        const dirA = FleetRegistryService.dataDir;
        FleetRegistryService.defineAgent({githubUsername: 'persist-agent', harnessType: 'native-neo', credential: 'ghp_persist'});

        // flip to a different (empty) dir -> the cache reloads, this registry is empty
        const dirB = makeDir('neo-fleet-other-');
        FleetRegistryService.dataDir = dirB;
        expect(FleetRegistryService.listAgents()).toHaveLength(0);

        // flip back -> the definition + credential reload and decrypt from disk
        FleetRegistryService.dataDir = dirA;
        expect(FleetRegistryService.getAgent('persist-agent').harnessType).toBe('native-neo');
        expect(FleetRegistryService.resolveCredential('persist-agent')).toBe('ghp_persist');
    });

    test('removeAgent drops the stored credential too', () => {
        FleetRegistryService.defineAgent({githubUsername: 'temp-agent', harnessType: 'codex', credential: 'ghp_temp'});
        expect(FleetRegistryService.resolveCredential('temp-agent')).toBe('ghp_temp');

        FleetRegistryService.removeAgent('temp-agent');
        expect(FleetRegistryService.resolveCredential('temp-agent')).toBeNull();
    });

    test('rejects an invalid harnessType and missing required fields', () => {
        expect(() => FleetRegistryService.defineAgent({githubUsername: 'x', harnessType: 'emacs'})).toThrow(/invalid harnessType/);
        expect(() => FleetRegistryService.defineAgent({harnessType: 'codex'})).toThrow(/githubUsername/);
        expect(() => FleetRegistryService.defineAgent({githubUsername: 'x'})).toThrow(/harnessType/);
    });

    test('resolveCredential fails closed for an unknown agent', () => {
        expect(FleetRegistryService.resolveCredential('nobody')).toBeNull();
    });

    test('FAIL-CLOSED: prototype-chain ids never resolve to inherited members (gpt review RA)', () => {
        // empty store — none of these are real credentials; each must return null, not a function
        for (const key of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__']) {
            expect(FleetRegistryService.resolveCredential(key)).toBeNull();
        }
    });

    test('an agent id that collides with an Object.prototype name still round-trips', () => {
        FleetRegistryService.defineAgent({githubUsername: 'toString', harnessType: 'codex', credential: 'ghp_proto'});
        // the legitimately-named credential resolves; a different proto-name remains absent
        expect(FleetRegistryService.resolveCredential('toString')).toBe('ghp_proto');
        expect(FleetRegistryService.resolveCredential('constructor')).toBeNull();
    });

    // ---- Bridge session token credential class -----------------------------
    // A second, distinct credential class for agent<->Neural-Link-Bridge transport auth:
    // registry-minted, short-lived, hash-stored, verify-only. Inherits the freshDataDir hooks above.
    test.describe('Bridge session token credential class (#13065)', () => {
        test('mint -> verify round-trip; wrong / unknown token fails closed', () => {
            const {token, expiresAt} = FleetRegistryService.mintBridgeToken('round-trip-agent');

            expect(typeof token).toBe('string');
            expect(token.length).toBeGreaterThan(0);
            expect(expiresAt).toBeGreaterThan(Date.now());

            expect(FleetRegistryService.verifyBridgeToken('round-trip-agent', token)).toBe(true);
            expect(FleetRegistryService.verifyBridgeToken('round-trip-agent', 'wrong-token')).toBe(false);
            expect(FleetRegistryService.verifyBridgeToken('unknown-agent', token)).toBe(false);
        });

        test('a re-mint rotates the token — the prior token no longer verifies', () => {
            const first = FleetRegistryService.mintBridgeToken('rotating-agent').token;
            const next  = FleetRegistryService.mintBridgeToken('rotating-agent').token;

            expect(next).not.toBe(first);
            expect(FleetRegistryService.verifyBridgeToken('rotating-agent', next)).toBe(true);
            expect(FleetRegistryService.verifyBridgeToken('rotating-agent', first)).toBe(false);
        });

        test('verifyBridgeToken rejects an expired token', () => {
            const {token} = FleetRegistryService.mintBridgeToken('expiring-agent', {ttlMs: -1});
            expect(FleetRegistryService.verifyBridgeToken('expiring-agent', token)).toBe(false);
        });

        test('SECURITY: mint returns the token once; only its hash persists (no raw token at rest)', () => {
            const {token} = FleetRegistryService.mintBridgeToken('bridge-agent');

            // (a) the at-rest file is ciphertext — the raw token must not appear
            const raw = fs.readFileSync(path.join(FleetRegistryService.dataDir, 'bridgeTokens.enc'), 'utf8');
            expect(raw).not.toContain(token);

            // (b) inspect the decrypted store payload — only {hash, expiresAt, createdAt}, never the raw token
            const record = FleetRegistryService.readBridgeTokens()['bridge-agent'];
            expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
            expect(record.token).toBeUndefined();
            expect(JSON.stringify(record)).not.toContain(token);
        });

        test('SECURITY: the Bridge store is separate from the PAT store; the PAT class is unaffected', () => {
            const pat = 'ghp_CoexistToken_99887766';
            FleetRegistryService.defineAgent({githubUsername: 'dual-agent', harnessType: 'codex', credential: pat});
            const {token} = FleetRegistryService.mintBridgeToken('dual-agent');

            const dir = FleetRegistryService.dataDir;
            // two distinct files; the Bridge token never routes through credentials.enc
            expect(fs.existsSync(path.join(dir, 'credentials.enc'))).toBe(true);
            expect(fs.existsSync(path.join(dir, 'bridgeTokens.enc'))).toBe(true);

            // the PAT still round-trips through its own accessor, unchanged by the Bridge token
            expect(FleetRegistryService.resolveCredential('dual-agent')).toBe(pat);
            // the Bridge token verifies through its own path; the two classes never cross-validate
            expect(FleetRegistryService.verifyBridgeToken('dual-agent', token)).toBe(true);
            expect(FleetRegistryService.verifyBridgeToken('dual-agent', pat)).toBe(false);
        });

        test('FAIL-CLOSED: a corrupt Bridge store yields false, never throws', () => {
            const {token} = FleetRegistryService.mintBridgeToken('corrupt-agent');
            fs.writeFileSync(path.join(FleetRegistryService.dataDir, 'bridgeTokens.enc'), 'not-valid-ciphertext', 'utf8');
            expect(FleetRegistryService.verifyBridgeToken('corrupt-agent', token)).toBe(false);
        });

        test('FAIL-CLOSED: prototype-chain ids never verify against an empty Bridge store', () => {
            for (const key of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__']) {
                expect(FleetRegistryService.verifyBridgeToken(key, 'anything')).toBe(false);
            }
        });
    });
});
