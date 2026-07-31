import {test, expect}                                             from '@playwright/test';
import {mkdtemp, readFile, readdir, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {existsSync}                                               from 'node:fs';
import os                                                         from 'node:os';
import path                                                       from 'node:path';

import {
    buildWakeReceiverManifest,
    fingerprintSigningKey,
    readPublishedRoutes,
    runManifestBuilder,
    writeValidatedManifest
} from '../../../../../../ai/daemons/wake/buildReceiverManifest.mjs';

const SERVER_KEY = 'a'.repeat(64),
      PEER_KEY   = 'b'.repeat(64);

/**
 * Shape pinned from a real migrated record: `update` MERGES rather than replaces, so a migrated
 * subscription carries BOTH `userDataDir` (legacy) and `instanceAddress` (current).
 */
const webhookSubscription = {
    id                   : 'WAKE_SUB:84dfc4da-0000-4000-8000-000000000001',
    status               : 'active',
    agentIdentity        : '@neo-opus-ada',
    trigger              : 'SENT_TO_ME',
    harnessTarget        : 'a2a-webhook',
    harnessTargetMetadata: {
        adapter        : 'osascript',
        appName        : 'Claude',
        tabShortcut    : '3',
        focusSeedKey   : 'space',
        addressType    : 'webhookUrl',
        instanceAddress: 'http://127.0.0.1:45999/wake',
        userDataDir    : '/legacy/path',
        signingKey     : SERVER_KEY,
        url            : 'http://host.docker.internal:45999/wake'
    }
};

const bridgeDaemonSubscription = {
    id                   : 'WAKE_SUB:84dfc4da-0000-4000-8000-000000000002',
    status               : 'active',
    agentIdentity        : '@neo-kimi-iris',
    trigger              : 'SENT_TO_ME',
    harnessTarget        : 'bridge-daemon',
    harnessTargetMetadata: {appName: 'Claude', tabShortcut: '3', focusSeedKey: 'space'}
};

async function tempDir() {
    return await mkdtemp(path.join(os.tmpdir(), 'wake-manifest-'))
}

test.describe('buildWakeReceiverManifest — key authority', () => {
    test('uses the server-issued key and never mints one', () => {
        const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]});

        // A minted key would boot cleanly and 401 every real container wake.
        expect(manifest.routes[webhookSubscription.id].signingKey).toBe(SERVER_KEY)
    });

    test('refuses an a2a-webhook record carrying no server key rather than inventing one', () => {
        const {signingKey, ...rest} = webhookSubscription.harnessTargetMetadata;

        expect(() => buildWakeReceiverManifest({
            subscriptions: [{...webhookSubscription, harnessTargetMetadata: rest}]
        })).toThrow(/no server-issued signingKey/i)
    });

    test('fails closed when the published key disagrees with the server key', () => {
        expect(() => buildWakeReceiverManifest({
            subscriptions : [webhookSubscription],
            existingRoutes: {[webhookSubscription.id]: {signingKey: PEER_KEY}}
        })).toThrow(/disagrees with the published manifest/i)
    });

    test('strips sender-only fields from receiver-visible metadata', () => {
        const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]}),
              metadata   = manifest.routes[webhookSubscription.id].harnessTargetMetadata;

        expect(metadata.signingKey).toBeUndefined();
        expect(metadata.url).toBeUndefined();
        // The legacy/current pair from a merged update must survive untouched.
        expect(metadata.userDataDir).toBe('/legacy/path');
        expect(metadata.instanceAddress).toBe('http://127.0.0.1:45999/wake')
    });
});

test.describe('buildWakeReceiverManifest — route class', () => {
    test('skips an undeliverable target with a named reason instead of publishing a dead route', () => {
        const {manifest, routeSummaries, skipped} = buildWakeReceiverManifest({
            subscriptions: [webhookSubscription, bridgeDaemonSubscription]
        });

        // The mixed set is the case that occurs mid-migration, and mid-migration is when this runs.
        expect(Object.keys(manifest.routes)).toEqual([webhookSubscription.id]);
        expect(routeSummaries).toHaveLength(1);
        expect(skipped).toHaveLength(1);
        expect(skipped[0].subscriptionId).toBe(bridgeDaemonSubscription.id);
        expect(skipped[0].reason).toMatch(/not deliverable/i)
    });

    test('reports the adapter the route will actually use, never a platform default', () => {
        const {routeSummaries} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]});

        // Falling back to the platform default once made the summary assert an adapter that was not
        // in the manifest — a false statement that reads as confirmation.
        expect(routeSummaries[0].adapter).toBe('osascript');

        const noAdapter = buildWakeReceiverManifest({
            subscriptions: [{
                ...webhookSubscription,
                harnessTargetMetadata: {...webhookSubscription.harnessTargetMetadata, adapter: undefined}
            }]
        });

        expect(noAdapter.routeSummaries[0].adapter).toBeNull()
    });

    test('skips inactive records and refuses a set that yields no route at all', () => {
        const {skipped} = buildWakeReceiverManifest({
            subscriptions : [{...webhookSubscription, status: 'retired'}],
            existingRoutes: {'WAKE_SUB:keep-me': {signingKey: PEER_KEY}}
        });

        expect(skipped[0].reason).toMatch(/status is 'retired'/);

        expect(() => buildWakeReceiverManifest({subscriptions: [bridgeDaemonSubscription]}))
            .toThrow(/refusing to write an empty manifest/i)
    });
});

test.describe('buildWakeReceiverManifest — composition', () => {
    test('merges into existing routes so one seat cannot delete a peer', () => {
        const peerId = 'WAKE_SUB:84dfc4da-0000-4000-8000-0000000000ff';

        const {manifest} = buildWakeReceiverManifest({
            subscriptions : [webhookSubscription],
            existingRoutes: {[peerId]: {agentIdentity: '@neo-opus-grace', signingKey: PEER_KEY}}
        });

        expect(Object.keys(manifest.routes).sort()).toEqual([webhookSubscription.id, peerId].sort());
        expect(manifest.routes[peerId].signingKey).toBe(PEER_KEY)
    });

    test('keeps per-route keys distinct and fingerprints non-reversible', () => {
        const {routeSummaries} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]});

        expect(JSON.stringify(routeSummaries)).not.toContain(SERVER_KEY);
        expect(routeSummaries[0].keyFingerprint).toBe(fingerprintSigningKey(SERVER_KEY));
        expect(fingerprintSigningKey(SERVER_KEY)).not.toBe(fingerprintSigningKey(PEER_KEY))
    });
});

test.describe('writeValidatedManifest', () => {
    test('publishes 0600 and leaves no staging residue', async () => {
        const dir = await tempDir();

        try {
            const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]}),
                  target     = path.join(dir, 'routes.json');

            await writeValidatedManifest({manifest, targetPath: target});

            expect((await stat(target)).mode & 0o077).toBe(0);
            expect((await readdir(dir)).filter(name => name.includes('staging'))).toEqual([])
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('a pre-created staging symlink cannot capture the secrets or become the target', async () => {
        const dir = await tempDir();

        try {
            const target = path.join(dir, 'routes.json'),
                  victim = path.join(dir, 'victim.txt');

            await writeFile(victim, 'original\n');
            // The old implementation used this exact predictable name and followed the link.
            await symlink(victim, `${target}.staging`);

            const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]});

            await writeValidatedManifest({manifest, targetPath: target});

            expect(await readFile(victim, 'utf8')).toBe('original\n');
            expect(JSON.parse(await readFile(target, 'utf8')).routes[webhookSubscription.id].signingKey)
                .toBe(SERVER_KEY)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('publishes nothing and leaves no residue when the receiver rejects the manifest', async () => {
        const dir = await tempDir();

        try {
            const target     = path.join(dir, 'routes.json'),
                  {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]});

            manifest.routes[webhookSubscription.id].harnessTargetMetadata.adapter = 'test-adapter';

            await expect(writeValidatedManifest({manifest, targetPath: target}))
                .rejects.toThrow(/Refusing to publish a manifest the receiver rejects/i);

            expect(existsSync(target)).toBe(false);
            expect((await readdir(dir)).filter(name => name.includes('staging'))).toEqual([])
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('requires an absolute target path', async () => {
        const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]});

        await expect(writeValidatedManifest({manifest, targetPath: 'routes.json'}))
            .rejects.toThrow(/must be absolute/i)
    });
});

test.describe('runManifestBuilder — per-peer composition', () => {
    test('each family provisions its own seat without unprovisioning another', async () => {
        const dir = await tempDir();

        try {
            const manifestPath = path.join(dir, 'routes.json'),
                  claudeInput  = path.join(dir, 'claude.json'),
                  kimiInput    = path.join(dir, 'kimi.json'),
                  lines        = [],
                  logger       = {log: line => lines.push(line)};

            await writeFile(claudeInput, JSON.stringify({subscriptions: [webhookSubscription]}));
            await writeFile(kimiInput, JSON.stringify({subscriptions: [
                {
                    ...webhookSubscription,
                    id                   : 'WAKE_SUB:84dfc4da-0000-4000-8000-00000000000a',
                    agentIdentity        : '@neo-kimi-iris',
                    harnessTargetMetadata: {
                        ...webhookSubscription.harnessTargetMetadata,
                        adapter   : 'kimi-server',
                        signingKey: PEER_KEY
                    }
                },
                bridgeDaemonSubscription
            ]}));

            await runManifestBuilder({subscriptionsPath: claudeInput, manifestPath, logger});
            const second = await runManifestBuilder({subscriptionsPath: kimiInput, manifestPath, logger});

            const published = await readPublishedRoutes(manifestPath);

            // The second caller must not be able to unprovision the first.
            expect(Object.keys(published)).toHaveLength(2);
            expect(published[webhookSubscription.id].agentIdentity).toBe('@neo-opus-ada');
            expect(published['WAKE_SUB:84dfc4da-0000-4000-8000-00000000000a'].agentIdentity)
                .toBe('@neo-kimi-iris');

            // An undeliverable seat is reported, not silently absent — silence is how a peer stays
            // deaf without anyone noticing.
            expect(second.skipped).toHaveLength(1);
            expect(lines.some(line => line.includes('SKIPPED') && line.includes('not deliverable'))).toBe(true);
            expect(lines.join('\n')).not.toContain(SERVER_KEY);
            expect(lines.join('\n')).not.toContain(PEER_KEY)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('refuses without both flags rather than guessing a path', async () => {
        await expect(runManifestBuilder({subscriptionsPath: '-'})).rejects.toThrow(/Usage:/)
    });
});

test.describe('readPublishedRoutes', () => {
    test('round-trips published routes for additive rebuilds', async () => {
        const dir = await tempDir();

        try {
            const target     = path.join(dir, 'routes.json'),
                  {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription]});

            await writeValidatedManifest({manifest, targetPath: target});

            const published = await readPublishedRoutes(target);

            expect(published[webhookSubscription.id].signingKey).toBe(SERVER_KEY)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('only a MISSING manifest means first boot; corrupt or unreadable stops the build', async () => {
        const dir = await tempDir();

        try {
            expect(await readPublishedRoutes(path.join(dir, 'absent.json'))).toEqual({});

            const corrupt = path.join(dir, 'corrupt.json');
            await writeFile(corrupt, 'not json\n', {mode: 0o600});

            // Returning {} here once rotated live keys and 401'd an already-provisioned container.
            await expect(readPublishedRoutes(corrupt)).rejects.toThrow(/rotate live signing keys/i);

            const routeless = path.join(dir, 'routeless.json');
            await writeFile(routeless, '{"schemaVersion":1}\n', {mode: 0o600});

            await expect(readPublishedRoutes(routeless)).rejects.toThrow(/no routes object/i)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });
});
