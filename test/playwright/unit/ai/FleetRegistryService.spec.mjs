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
import crypto          from 'crypto';

import Neo                  from '../../../../src/Neo.mjs';
import * as core            from '../../../../src/core/_export.mjs';
import FleetRegistryService from '../../../../ai/services/fleet/FleetRegistryService.mjs';
import aiConfig             from '../../../../ai/config.mjs';

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

    test('modelProvider resolves via the AiConfig SSOT leaf when unset, honors an explicit value, and is preserved on update', () => {
        // unset -> resolves via the AiConfig modelProvider SSOT (read-only; no service-local default shadow)
        const defaulted = FleetRegistryService.defineAgent({githubUsername: 'prov-default', harnessType: 'codex'});
        expect(defaulted.modelProvider).toBe(aiConfig.modelProvider);

        // an explicit value wins over the SSOT default
        const explicit = FleetRegistryService.defineAgent({githubUsername: 'prov-explicit', harnessType: 'codex', modelProvider: 'ollama'});
        expect(explicit.modelProvider).toBe('ollama');

        // a prior value is preserved when the agent is re-defined without modelProvider
        const updated = FleetRegistryService.defineAgent({githubUsername: 'prov-explicit', harnessType: 'codex'});
        expect(updated.modelProvider).toBe('ollama');

        // non-secret: the provider-login is carried in the public projection
        expect(FleetRegistryService.getAgent('prov-explicit').modelProvider).toBe('ollama');
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
    // The agent<->Neural-Link-Bridge transport credential: registry-minted, short-lived, and
    // **asymmetrically signed**. The token is a stateless `payload.sig` — an
    // Ed25519 signature over `{agentId, expiresAt}`. The network-facing Bridge verifies with only the
    // PUBLIC key (getBridgePublicKey), holding no secret + no store. Inherits the freshDataDir hooks.
    test.describe('Bridge session token credential class (#13172 — asymmetric-signed)', () => {
        // Verify a minted token the way the Bridge does: Ed25519 over the exact signed payload bytes
        // with the public key, then decode the claims. Returns `{agentId, expiresAt}` or null.
        const verifyWithPublicKey = token => {
            const pub = crypto.createPublicKey(FleetRegistryService.getBridgePublicKey()),
                  dot = token.indexOf('.');
            if (dot < 1) return null;
            const payload   = Buffer.from(token.slice(0, dot), 'base64url'),
                  signature = Buffer.from(token.slice(dot + 1), 'base64url');
            if (!crypto.verify(null, payload, pub, signature)) return null;
            return JSON.parse(payload.toString('utf8'));
        };

        test('mint -> verify round-trip: the public key recovers the SIGNED agentId + expiry', () => {
            const {token, expiresAt} = FleetRegistryService.mintBridgeToken('round-trip-agent');

            expect(typeof token).toBe('string');
            expect(token).toContain('.');
            expect(expiresAt).toBeGreaterThan(Date.now());

            const claims = verifyWithPublicKey(token);
            expect(claims).not.toBeNull();
            expect(claims.agentId).toBe('round-trip-agent'); // identity rides INSIDE the signature
            expect(claims.expiresAt).toBe(expiresAt);
        });

        test('SECURITY: a forged / tampered / foreign-signed token fails verification', () => {
            const {token}              = FleetRegistryService.mintBridgeToken('victim-agent'),
                  [payloadB64, sigB64] = token.split('.');

            // (a) tamper the payload to claim a different agentId — the signature no longer matches
            const forged = Buffer.from(JSON.stringify({agentId: 'attacker', expiresAt: Date.now() + 1e6})).toString('base64url');
            expect(verifyWithPublicKey(`${forged}.${sigB64}`)).toBeNull();

            // (b) tamper the signature bytes
            expect(verifyWithPublicKey(`${payloadB64}.${sigB64.slice(0, -4)}AAAA`)).toBeNull();

            // (c) a token signed by a DIFFERENT key never verifies against ours (can't forge w/o the private key)
            const other   = crypto.generateKeyPairSync('ed25519'),
                  p       = Buffer.from(JSON.stringify({agentId: 'victim-agent', expiresAt: Date.now() + 1e6})),
                  foreign = `${p.toString('base64url')}.${crypto.sign(null, p, other.privateKey).toString('base64url')}`;
            expect(verifyWithPublicKey(foreign)).toBeNull();
        });

        test('an expired token is signed with a past expiry (the verifier rejects on expiresAt separately)', () => {
            const {token, expiresAt} = FleetRegistryService.mintBridgeToken('expiring-agent', {ttlMs: -1});
            expect(expiresAt).toBeLessThanOrEqual(Date.now());
            // the signature is still valid — expiry is a SEPARATE check the Bridge enforces on the claims
            expect(verifyWithPublicKey(token).expiresAt).toBe(expiresAt);
        });

        test('the public verify key carries no private material + is stable across calls', () => {
            const pub = FleetRegistryService.getBridgePublicKey();
            expect(pub).toContain('BEGIN PUBLIC KEY');
            expect(pub).not.toContain('PRIVATE');
            expect(FleetRegistryService.getBridgePublicKey()).toBe(pub); // same generated keypair
        });

        test('SECURITY: stateless — the signing key is 0600, no per-token store, no raw secret in the token', () => {
            const {token} = FleetRegistryService.mintBridgeToken('at-rest-agent'),
                  dir     = FleetRegistryService.dataDir;

            // stateless: the prior hash-store file is gone
            expect(fs.existsSync(path.join(dir, 'bridgeTokens.enc'))).toBe(false);

            // the generated signing key is a 0600 PKCS8 PEM private key, distinct from the AES master
            const keyFile = path.join(dir, 'signing.key');
            expect(fs.existsSync(keyFile)).toBe(true);
            expect(fs.statSync(keyFile).mode & 0o777).toBe(0o600);
            // the token itself carries no private key material
            expect(token).not.toContain('PRIVATE');
        });

        test('SECURITY: the PAT class is unaffected; a Bridge token never decodes a PAT', () => {
            const pat = 'ghp_CoexistToken_99887766';
            FleetRegistryService.defineAgent({githubUsername: 'dual-agent', harnessType: 'codex', credential: pat});
            const {token} = FleetRegistryService.mintBridgeToken('dual-agent'),
                  dir     = FleetRegistryService.dataDir;

            // distinct key files: the AES master (fleet.key, encrypts the PAT store) + the Ed25519 signer (signing.key)
            expect(fs.existsSync(path.join(dir, 'fleet.key'))).toBe(true);
            expect(fs.existsSync(path.join(dir, 'signing.key'))).toBe(true);

            expect(FleetRegistryService.resolveCredential('dual-agent')).toBe(pat);     // PAT round-trips, unchanged
            expect(verifyWithPublicKey(token).agentId).toBe('dual-agent');              // token decodes an agentId, not a PAT
        });

        test('removeAgent does NOT revoke the stateless signed token (≤TTL lag, accepted — #13172)', () => {
            FleetRegistryService.defineAgent({githubUsername: 'gone-agent', harnessType: 'codex'});
            const {token} = FleetRegistryService.mintBridgeToken('gone-agent');
            expect(verifyWithPublicKey(token).agentId).toBe('gone-agent');

            FleetRegistryService.removeAgent('gone-agent');

            // the signature stays valid post-removal — the token self-expires within bridgeTokenTtlMs.
            // Immediate eviction of a compromised agent is a later additive Bridge revocation-denylist;
            // WriteGuard's no-clobber invariant denies an overlapping cross-agent write in the interim.
            expect(verifyWithPublicKey(token).agentId).toBe('gone-agent');
        });
    });
});
