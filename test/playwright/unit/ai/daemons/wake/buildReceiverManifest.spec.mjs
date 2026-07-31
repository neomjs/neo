import {test, expect}                           from '@playwright/test';
import {mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {existsSync}                             from 'node:fs';
import os                                       from 'node:os';
import path                                     from 'node:path';

import {
    buildWakeReceiverManifest,
    fingerprintSigningKey,
    readExistingSigningKeys,
    writeValidatedManifest
} from '../../../../../../ai/daemons/wake/buildReceiverManifest.mjs';

const activeSubscription = {
    id                   : 'WAKE_SUB:1b7cdb3a-2ae0-4262-9778-c4b86d4bc92a',
    status               : 'active',
    agentIdentity        : '@neo-opus-ada',
    trigger              : 'SENT_TO_ME',
    harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude', tabShortcut: '3', focusSeedKey: 'space'}
};

const retiredSubscription = {
    ...activeSubscription,
    id    : 'WAKE_SUB:fc6eace1-b0a3-49fd-9fa1-9f3418db8289',
    status: 'retired'
};

async function tempDir() {
    return await mkdtemp(path.join(os.tmpdir(), 'wake-manifest-'))
}

test.describe('buildWakeReceiverManifest', () => {
    test('maps active subscriptions to routes and excludes retired ones', () => {
        const {manifest, routeSummaries} = buildWakeReceiverManifest({
            subscriptions: [activeSubscription, retiredSubscription]
        });

        expect(manifest.schemaVersion).toBe(1);
        expect(Object.keys(manifest.routes)).toEqual([activeSubscription.id]);
        expect(routeSummaries).toHaveLength(1);

        const route = manifest.routes[activeSubscription.id];

        expect(route.agentIdentity).toBe('@neo-opus-ada');
        expect(route.harnessTargetMetadata).toEqual(activeSubscription.harnessTargetMetadata);
        expect(route.adapterConfig.attemptTimeoutMs).toBeGreaterThan(0);
        expect(route.signingKey).toHaveLength(64)
    });

    test('reuses a supplied signing key instead of rotating it', () => {
        const signingKey = 'a'.repeat(64);

        const {manifest, routeSummaries} = buildWakeReceiverManifest({
            subscriptions: [activeSubscription],
            signingKeys  : {[activeSubscription.id]: signingKey}
        });

        // Rotating on every build would silently break a container already signing with the old key.
        expect(manifest.routes[activeSubscription.id].signingKey).toBe(signingKey);
        expect(routeSummaries[0].reusedKey).toBe(true)
    });

    test('never exposes a signing key in the summary, only a fingerprint', () => {
        const signingKey = 'b'.repeat(64);

        const {routeSummaries} = buildWakeReceiverManifest({
            subscriptions: [activeSubscription],
            signingKeys  : {[activeSubscription.id]: signingKey}
        });

        const serialised = JSON.stringify(routeSummaries);

        expect(serialised).not.toContain(signingKey);
        expect(routeSummaries[0].keyFingerprint).toBe(fingerprintSigningKey(signingKey));
        expect(routeSummaries[0].keyFingerprint).toHaveLength(12)
    });

    test('refuses to produce an empty manifest', () => {
        expect(() => buildWakeReceiverManifest({subscriptions: [retiredSubscription]}))
            .toThrow(/refusing to write an empty manifest/i);
        expect(() => buildWakeReceiverManifest({subscriptions: 'nope'}))
            .toThrow(/requires a subscriptions array/i)
    });

    test('refuses a subscription missing the fields the receiver requires', () => {
        const cases = [
            [{...activeSubscription, id: 'not-a-wake-sub'},        /not a WAKE_SUB identifier/i],
            [{...activeSubscription, agentIdentity: ''},           /no agentIdentity/i],
            [{...activeSubscription, harnessTargetMetadata: null}, /no harnessTargetMetadata/i]
        ];

        for (const [subscription, pattern] of cases) {
            expect(() => buildWakeReceiverManifest({subscriptions: [subscription]})).toThrow(pattern)
        }
    });
});

test.describe('writeValidatedManifest', () => {
    test('writes 0600 and produces a manifest the receiver actually loads', async () => {
        const dir = await tempDir();

        try {
            const {manifest} = buildWakeReceiverManifest({subscriptions: [activeSubscription]}),
                  target     = path.join(dir, 'routes.json');

            await writeValidatedManifest({manifest, targetPath: target});

            // Mode matters: the receiver refuses anything group- or world-readable.
            expect((await stat(target)).mode & 0o077).toBe(0);
            expect(JSON.parse(await readFile(target, 'utf8')).schemaVersion).toBe(1)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('discards the staging file and publishes nothing when the receiver would reject it', async () => {
        const dir = await tempDir();

        try {
            const target = path.join(dir, 'routes.json');

            // An unsupported adapter is rejected by the receiver's loader, not by the builder — which
            // is the point: the generator defers to the receiver rather than duplicating its rules.
            const {manifest} = buildWakeReceiverManifest({
                subscriptions: [{
                    ...activeSubscription,
                    harnessTargetMetadata: {...activeSubscription.harnessTargetMetadata, adapter: 'test-adapter'}
                }]
            });

            await expect(writeValidatedManifest({manifest, targetPath: target}))
                .rejects.toThrow(/Refusing to publish a manifest the receiver rejects/i);

            // Neither the target nor the staging file may survive a rejected publish.
            expect(existsSync(target)).toBe(false);
            expect(existsSync(`${target}.staging`)).toBe(false)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('requires an absolute target path', async () => {
        const {manifest} = buildWakeReceiverManifest({subscriptions: [activeSubscription]});

        await expect(writeValidatedManifest({manifest, targetPath: 'routes.json'}))
            .rejects.toThrow(/must be absolute/i)
    });
});

test.describe('readExistingSigningKeys', () => {
    test('round-trips keys so a rebuild does not rotate them', async () => {
        const dir = await tempDir();

        try {
            const target      = path.join(dir, 'routes.json'),
                  {manifest}  = buildWakeReceiverManifest({subscriptions: [activeSubscription]}),
                  originalKey = manifest.routes[activeSubscription.id].signingKey;

            await writeValidatedManifest({manifest, targetPath: target});

            const rebuilt = buildWakeReceiverManifest({
                subscriptions: [activeSubscription],
                signingKeys  : await readExistingSigningKeys(target)
            });

            expect(rebuilt.manifest.routes[activeSubscription.id].signingKey).toBe(originalKey)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('returns an empty map rather than throwing when no manifest exists', async () => {
        const dir = await tempDir();

        try {
            expect(await readExistingSigningKeys(path.join(dir, 'absent.json'))).toEqual({});

            await writeFile(path.join(dir, 'garbage.json'), 'not json\n', {mode: 0o600});
            expect(await readExistingSigningKeys(path.join(dir, 'garbage.json'))).toEqual({})
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });
});
