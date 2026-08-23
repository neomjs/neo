import {test, expect}                                             from '@playwright/test';
import {mkdtemp, readFile, readdir, rm, stat, symlink, writeFile} from 'node:fs/promises';
import {existsSync}                                               from 'node:fs';
import os                                                         from 'node:os';
import path                                                       from 'node:path';

import {
    buildWakeReceiverManifest,
    DEFAULT_CONTEXT_GATE,
    fingerprintSigningKey,
    parseManifestBuilderArgs,
    readPublishedRoutes,
    runManifestBuilder,
    writeValidatedManifest
} from '../../../../../../ai/daemons/wake/buildReceiverManifest.mjs';

const SERVER_KEY = 'a'.repeat(64),
      PEER_KEY   = 'b'.repeat(64);

/**
 * The explicit per-seat GUI instance tuple, supplied through the third input (never derived from a
 * record). `userDataDir` is the durable choice for generated routes (`pid` is ephemeral).
 */
const INSTANCE = {type: 'userDataDir', address: '/seat/current/instance'};

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
        const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE});

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

    test('strips sender-only AND sender-routing fields; the GUI tuple comes only from the explicit instance input', () => {
        const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE}),
              metadata   = manifest.routes[webhookSubscription.id].harnessTargetMetadata;

        expect(metadata.signingKey).toBeUndefined();
        expect(metadata.url).toBeUndefined();
        // Sender-side routing is stripped — the record's webhookUrl tuple must NOT be mapped through
        // (it passes the loader and then fails every dispatch silently: the loader-gate trap).
        expect(metadata.userDataDir).toBeUndefined();
        // …and the receiver-side tuple comes only from the explicit instance input.
        expect(metadata.addressType).toBe(INSTANCE.type);
        expect(metadata.instanceAddress).toBe(INSTANCE.address)
    });
});

test.describe('buildWakeReceiverManifest — route class', () => {
    test('skips an undeliverable target with a named reason instead of publishing a dead route', () => {
        const {manifest, routeSummaries, skipped} = buildWakeReceiverManifest({
            subscriptions: [webhookSubscription, bridgeDaemonSubscription],
            instance     : INSTANCE
        });

        // The mixed set is the case that occurs mid-migration, and mid-migration is when this runs.
        expect(Object.keys(manifest.routes)).toEqual([webhookSubscription.id]);
        expect(routeSummaries).toHaveLength(1);
        expect(skipped).toHaveLength(1);
        expect(skipped[0].subscriptionId).toBe(bridgeDaemonSubscription.id);
        expect(skipped[0].reason).toMatch(/not deliverable/i)
    });

    test('reports the adapter the route will actually use, never a platform default', () => {
        const {routeSummaries} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE});

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
            existingRoutes: {[peerId]: {agentIdentity: '@neo-opus-grace', signingKey: PEER_KEY}},
            instance      : INSTANCE
        });

        expect(Object.keys(manifest.routes).sort()).toEqual([webhookSubscription.id, peerId].sort());
        expect(manifest.routes[peerId].signingKey).toBe(PEER_KEY)
    });

    test('keeps per-route keys distinct and fingerprints non-reversible', () => {
        const {routeSummaries} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE});

        expect(JSON.stringify(routeSummaries)).not.toContain(SERVER_KEY);
        expect(routeSummaries[0].keyFingerprint).toBe(fingerprintSigningKey(SERVER_KEY));
        expect(fingerprintSigningKey(SERVER_KEY)).not.toBe(fingerprintSigningKey(PEER_KEY))
    });
});

test.describe('writeValidatedManifest', () => {
    test('publishes 0600 and leaves no staging residue', async () => {
        const dir = await tempDir();

        try {
            const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE}),
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

            const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE});

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
                  {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE});

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
        const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE});

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

            await runManifestBuilder({
                subscriptionsPath: claudeInput,
                manifestPath,
                instanceType     : INSTANCE.type,
                instanceAddress  : INSTANCE.address,
                logger
            });
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

    test('CONCURRENT peers cannot unprovision each other', async () => {
        // The sequential spec above proves the merge and is structurally incapable of failing the way
        // the claim can be wrong. Before the lock, this lost a route in 20/20 trials: both callers read
        // the same predecessor and the later rename won.
        const dir = await tempDir();

        try {
            const manifestPath = path.join(dir, 'routes.json'),
                  quiet        = {log() {}},
                  inputs       = [];

            for (const [index, identity] of [['a', '@neo-opus-ada'], ['b', '@neo-kimi-iris']]) {
                const file = path.join(dir, `${index}.json`);

                await writeFile(file, JSON.stringify({subscriptions: [{
                    ...webhookSubscription,
                    id                   : `WAKE_SUB:${index.repeat(8)}-0000-4000-8000-00000000000${index === 'a' ? 1 : 2}`,
                    agentIdentity        : identity,
                    harnessTargetMetadata: {
                        ...webhookSubscription.harnessTargetMetadata,
                        signingKey: index.repeat(64)
                    }
                }]}));

                inputs.push(file)
            }

            await Promise.all(inputs.map(subscriptionsPath =>
                runManifestBuilder({
                    subscriptionsPath,
                    manifestPath,
                    instanceType   : INSTANCE.type,
                    instanceAddress: INSTANCE.address,
                    logger         : quiet
                })
            ));

            expect(Object.keys(await readPublishedRoutes(manifestPath))).toHaveLength(2)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('withdraws the callers OWN stale route on retarget, leaving peers published', async () => {
        const dir = await tempDir();

        try {
            const manifestPath = path.join(dir, 'routes.json'),
                  quiet        = {log() {}},
                  live         = path.join(dir, 'live.json'),
                  retargeted   = path.join(dir, 'retargeted.json'),
                  peerId       = 'WAKE_SUB:84dfc4da-0000-4000-8000-0000000000fe';

            await writeFile(live, JSON.stringify({subscriptions: [webhookSubscription]}));
            // Same id, now on a target the Shape-B path cannot deliver to.
            await writeFile(retargeted, JSON.stringify({subscriptions: [
                {...webhookSubscription, harnessTarget: 'bridge-daemon'}
            ]}));

            await runManifestBuilder({
                subscriptionsPath: live,
                manifestPath,
                instanceType     : INSTANCE.type,
                instanceAddress  : INSTANCE.address,
                logger           : quiet
            });

            // Seed a peer route that the caller does not own and must not touch.
            const withPeer = buildWakeReceiverManifest({
                subscriptions : [],
                existingRoutes: {
                    ...await readPublishedRoutes(manifestPath),
                    [peerId]: {
                        agentIdentity        : '@neo-opus-grace',
                        signingKey           : PEER_KEY,
                        harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                        adapterConfig        : {attemptTimeoutMs: 10000}
                    }
                }
            });

            await writeValidatedManifest({manifest: withPeer.manifest, targetPath: manifestPath});

            const result    = await runManifestBuilder({subscriptionsPath: retargeted, manifestPath, logger: quiet}),
                  published = await readPublishedRoutes(manifestPath);

            // Skipping the input alone left the stale route accepting wakes for a seat that moved.
            expect(published[webhookSubscription.id]).toBeUndefined();
            expect(result.skipped[0].withdrewPublishedRoute).toBe(true);
            expect(published[peerId].agentIdentity).toBe('@neo-opus-grace')
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('sanitises sender secrets carried in from a manifest written by an older version', () => {
        const legacyId = 'WAKE_SUB:84dfc4da-0000-4000-8000-0000000000ee';

        const {manifest} = buildWakeReceiverManifest({
            subscriptions : [],
            existingRoutes: {
                [legacyId]: {
                    agentIdentity: '@neo-gpt-emmy',
                    signingKey   : PEER_KEY,
                    // An older build left the sender-only pair inside the metadata.
                    harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude', signingKey: PEER_KEY, url: 'http://x/'},
                    adapterConfig        : {attemptTimeoutMs: 10000}
                }
            }
        });

        const carried = manifest.routes[legacyId];

        expect(carried.harnessTargetMetadata.signingKey).toBeUndefined();
        expect(carried.harnessTargetMetadata.url).toBeUndefined();
        // The route's own key field is where the receiver reads it, and must survive.
        expect(carried.signingKey).toBe(PEER_KEY)
    });

    test('makes Codex adapter config reachable from a supported input', () => {
        const codexSubscription = {
            ...webhookSubscription,
            harnessTargetMetadata: {
                ...webhookSubscription.harnessTargetMetadata,
                adapter     : 'codex-app-server',
                appName     : 'Codex',
                focusSeedKey: 'space'
            }
        };

        // The subscription record carries no adapterConfig, so without a caller-supplied path a
        // Codex route could never satisfy the receiver's codexBinary requirement.
        const {manifest} = buildWakeReceiverManifest({
            subscriptions    : [codexSubscription],
            adapterConfigById: {[codexSubscription.id]: {codexBinary: '/usr/local/bin/codex'}}
        });

        expect(manifest.routes[codexSubscription.id].adapterConfig).toEqual({
            attemptTimeoutMs: 10000,
            codexBinary     : '/usr/local/bin/codex',
            contextGate     : DEFAULT_CONTEXT_GATE
        })
    });

    test('stamps the #16682 context gate on every route, merging per-route overrides over the defaults', () => {
        const plain = {
            id                   : 'WAKE_SUB:plain',
            status               : 'active',
            agentIdentity        : '@neo-kimi-phoebe',
            harnessTarget        : 'a2a-webhook',
            harnessTargetMetadata: {adapter: 'opencode-server', signingKey: 'c'.repeat(64)}
        };
        const tuned = {
            id                   : 'WAKE_SUB:tuned',
            status               : 'active',
            agentIdentity        : '@neo-kimi-iris',
            harnessTarget        : 'a2a-webhook',
            harnessTargetMetadata: {adapter: 'kimi-pull-bridge', signingKey: 'd'.repeat(64)}
        };

        const {manifest} = buildWakeReceiverManifest({
            subscriptions    : [plain, tuned],
            adapterConfigById: {[tuned.id]: {contextGate: {maxContextTokens: 400_000}}}
        });

        expect(manifest.routes[plain.id].adapterConfig.contextGate).toEqual(DEFAULT_CONTEXT_GATE);
        // A per-key merge, not a wholesale replacement: the warn default survives a max override.
        expect(manifest.routes[tuned.id].adapterConfig.contextGate).toEqual({
            maxContextTokens : 400_000,
            warnContextTokens: DEFAULT_CONTEXT_GATE.warnContextTokens
        });
    });
});

test.describe('buildWakeReceiverManifest — the loader-gate trap, refused', () => {
    test('an osascript record without an explicit GUI tuple becomes a named skip, never an undeliverable route', () => {
        const {routeSummaries, skipped} = buildWakeReceiverManifest({
            subscriptions : [webhookSubscription],
            existingRoutes: {'WAKE_SUB:keep-me': {signingKey: PEER_KEY}}
        });

        expect(routeSummaries).toHaveLength(0);
        expect(skipped).toHaveLength(1);
        expect(skipped[0].reason).toMatch(/requires a GUI instance tuple/i);
        expect(skipped[0].reason).toMatch(/refusing to emit an undeliverable route/i);

        // When it is the ONLY record, the refusal reads in the refuse-empty error — never silently.
        expect(() => buildWakeReceiverManifest({subscriptions: [webhookSubscription]}))
            .toThrow(/refusing to write an empty manifest.*requires a GUI instance tuple/is)
    });

    test('the emitted route carries the SUPPLIED tuple, never the record\'s sender-side routing', () => {
        const {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE}),
              metadata   = manifest.routes[webhookSubscription.id].harnessTargetMetadata;

        // The record's webhookUrl tuple would pass the loader and fail every dispatch — it must
        // not survive anywhere in the emitted route.
        expect(metadata.addressType).toBe(INSTANCE.type);
        expect(metadata.instanceAddress).toBe(INSTANCE.address);
        expect(metadata.instanceAddress).not.toContain('127.0.0.1');
        expect(JSON.stringify(metadata)).not.toContain('webhookUrl')
    });

    test('an emitted pid tuple carries the ephemerality warning — recorded, never silent', () => {
        const {routeSummaries} = buildWakeReceiverManifest({
            subscriptions: [webhookSubscription],
            instance     : {type: 'pid', address: '4242'}
        });

        expect(routeSummaries[0].warn).toMatch(/ephemeral/i)
    });
});

test.describe('buildWakeReceiverManifest — owner-set reconciliation', () => {
    test('withdraws a caller-owned route whose id is absent from the input; a peer\'s is untouched', () => {
        const ownId  = 'WAKE_SUB:84dfc4da-0000-4000-8000-0000000000aa',
              peerId = 'WAKE_SUB:84dfc4da-0000-4000-8000-0000000000bb';

        const {manifest, skipped} = buildWakeReceiverManifest({
            subscriptions : [webhookSubscription], // only the live record; ownId is absent (unsubscribed)
            callerIdentity: '@neo-opus-ada',
            instance      : INSTANCE,
            existingRoutes: {
                [ownId]: {
                    agentIdentity        : '@neo-opus-ada',
                    signingKey           : SERVER_KEY,
                    harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                    adapterConfig        : {attemptTimeoutMs: 10000}
                },
                [peerId]: {
                    agentIdentity        : '@neo-opus-grace',
                    signingKey           : PEER_KEY,
                    harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                    adapterConfig        : {attemptTimeoutMs: 10000}
                }
            }
        });

        expect(manifest.routes[ownId]).toBeUndefined(); // withdrawn — the server row is gone
        expect(manifest.routes[peerId].signingKey).toBe(PEER_KEY); // peer untouched
        expect(skipped.some(entry => entry.subscriptionId === ownId && /no active subscription record/.test(entry.reason))).toBe(true)
    });

    test('a withdrawal that empties the manifest PUBLISHES — the last stale route must not survive', async () => {
        const dir = await tempDir();

        try {
            const manifestPath = path.join(dir, 'routes.json'),
                  quiet        = {log() {}},
                  live         = path.join(dir, 'live.json'),
                  emptyInput   = path.join(dir, 'empty.json');

            await writeFile(live, JSON.stringify({subscriptions: [webhookSubscription]}));
            await writeFile(emptyInput, JSON.stringify({subscriptions: []}));

            // Seed the caller-owned route.
            await runManifestBuilder({
                subscriptionsPath: live,
                manifestPath,
                instanceType     : INSTANCE.type,
                instanceAddress  : INSTANCE.address,
                logger           : quiet
            });

            expect(Object.keys(await readPublishedRoutes(manifestPath))).toEqual([webhookSubscription.id]);

            // The seat unsubscribes everything: the withdrawal must PUBLISH the emptied manifest —
            // a guard that throws here leaves the stale route on disk forever.
            await runManifestBuilder({
                subscriptionsPath: emptyInput,
                manifestPath,
                identity         : '@neo-opus-ada',
                logger           : quiet
            });

            expect(Object.keys(await readPublishedRoutes(manifestPath))).toEqual([])
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('withdrawal-only control: the peer\'s route survives when the caller\'s last route is withdrawn', async () => {
        const dir = await tempDir();

        try {
            const manifestPath = path.join(dir, 'routes.json'),
                  quiet        = {log() {}},
                  live         = path.join(dir, 'live.json'),
                  emptyInput   = path.join(dir, 'empty.json'),
                  peerId       = 'WAKE_SUB:84dfc4da-0000-4000-8000-0000000000fe';

            await writeFile(live, JSON.stringify({subscriptions: [webhookSubscription]}));
            await writeFile(emptyInput, JSON.stringify({subscriptions: []}));

            await runManifestBuilder({
                subscriptionsPath: live,
                manifestPath,
                instanceType     : INSTANCE.type,
                instanceAddress  : INSTANCE.address,
                logger           : quiet
            });

            // Seed a peer route the caller does not own, through the validated publish path.
            const withPeer = buildWakeReceiverManifest({
                subscriptions : [],
                existingRoutes: {
                    ...await readPublishedRoutes(manifestPath),
                    [peerId]: {
                        agentIdentity        : '@neo-opus-grace',
                        signingKey           : PEER_KEY,
                        harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                        adapterConfig        : {attemptTimeoutMs: 10000}
                    }
                }
            });

            await writeValidatedManifest({manifest: withPeer.manifest, targetPath: manifestPath});

            await runManifestBuilder({
                subscriptionsPath: emptyInput,
                manifestPath,
                identity         : '@neo-opus-ada',
                logger           : quiet
            });

            const published = await readPublishedRoutes(manifestPath);

            expect(Object.keys(published)).toEqual([peerId]); // caller's route withdrawn, peer preserved
            expect(published[peerId].agentIdentity).toBe('@neo-opus-grace')
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('a carried undeliverable tuple is withdrawn with a named reason when no --instance supplies the repair', () => {
        // The trap shape, carried: same id as the live record, so the absent-id rule cannot fire first.
        const seed = {
            [webhookSubscription.id]: {
                agentIdentity        : '@neo-opus-ada',
                signingKey           : SERVER_KEY,
                harnessTargetMetadata: {
                    adapter        : 'osascript',
                    appName        : 'Claude',
                    addressType    : 'webhookUrl', // passes the loader, never delivers
                    instanceAddress: 'http://127.0.0.1:45999/wake'
                },
                adapterConfig        : {attemptTimeoutMs: 10000}
            }
        };

        // No instance: the live record is refusal-skipped AND the carried broken route is withdrawn —
        // nothing undeliverable survives the rebuild. The peer route rides along to keep the
        // manifest non-empty — and to prove it is never touched.
        const peerId    = 'WAKE_SUB:84dfc4da-0000-4000-8000-0000000000bb',
              withdrawn = buildWakeReceiverManifest({
                  subscriptions : [webhookSubscription],
                  callerIdentity: '@neo-opus-ada',
                  existingRoutes: {
                      ...seed,
                      [peerId]: {
                          agentIdentity        : '@neo-opus-grace',
                          signingKey           : PEER_KEY,
                          harnessTargetMetadata: {adapter: 'osascript', appName: 'Claude'},
                          adapterConfig        : {attemptTimeoutMs: 10000}
                      }
                  }
              });

        expect(withdrawn.manifest.routes[webhookSubscription.id]).toBeUndefined();
        expect(Object.keys(withdrawn.manifest.routes)).toEqual([peerId]);
        expect(withdrawn.manifest.routes[peerId].signingKey).toBe(PEER_KEY);
        expect(withdrawn.skipped.some(entry =>
            entry.subscriptionId === webhookSubscription.id && /undeliverable addressType/.test(entry.reason)
        )).toBe(true)
    });
});

test.describe('runManifestBuilder — strict-lock + boot truths', () => {
    test('a LIVE holder is never reclaimed, and a dead-pid leftover is reclaimed', async () => {
        const dir = await tempDir();

        try {
            const manifestPath = path.join(dir, 'routes.json'),
                  lockPath     = `${manifestPath}.lock`,
                  quiet        = {log() {}},
                  input        = path.join(dir, 'input.json');

            await writeFile(input, JSON.stringify({subscriptions: [webhookSubscription]}));

            // A live pid holds the lock: acquisition must time out rather than reclaim by age.
            await writeFile(lockPath, JSON.stringify({pid: process.pid, startedAt: Date.now() - 600000}));

            await expect(runManifestBuilder({
                subscriptionsPath: input,
                manifestPath,
                instanceType     : INSTANCE.type,
                instanceAddress  : INSTANCE.address,
                lockOptions      : {acquireTimeoutMs: 200, retryIntervalMs: 10},
                logger           : quiet
            })).rejects.toThrow(/could not acquire/i);

            // A dead pid's leftover is reclaimed via the liveness probe and the build proceeds.
            await writeFile(lockPath, JSON.stringify({pid: 424242, startedAt: Date.now() - 600000}));

            await runManifestBuilder({
                subscriptionsPath: input,
                manifestPath,
                instanceType     : INSTANCE.type,
                instanceAddress  : INSTANCE.address,
                logger           : quiet
            });

            expect(Object.keys(await readPublishedRoutes(manifestPath))).toHaveLength(1)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('first boot into a non-existent directory builds and validates', async () => {
        const dir = await tempDir();

        try {
            const manifestPath = path.join(dir, 'fresh', 'nested', 'routes.json'),
                  input        = path.join(dir, 'input.json'),
                  quiet        = {log() {}};

            await writeFile(input, JSON.stringify({subscriptions: [webhookSubscription]}));

            await runManifestBuilder({
                subscriptionsPath: input,
                manifestPath,
                instanceType     : INSTANCE.type,
                instanceAddress  : INSTANCE.address,
                logger           : quiet
            });

            expect((await stat(manifestPath)).mode & 0o077).toBe(0);
            expect((await readdir(path.dirname(manifestPath))).filter(name => name.includes('staging') || name.includes('lock'))).toEqual([])
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('parses the new CLI flags and validates the tuple pair + vocabulary', () => {
        const parsed = parseManifestBuilderArgs([
            '--subscriptions', 'subs.json', '--manifest', '/tmp/routes.json',
            '--identity', '@neo-kimi-iris',
            '--adapter-config', 'adapters.json',
            '--attempt-timeout-ms', '15000',
            '--instance', 'userDataDir', '--instance-address', '/seat/path'
        ]);

        expect(parsed).toEqual({
            subscriptionsPath: 'subs.json',
            manifestPath     : '/tmp/routes.json',
            identity         : '@neo-kimi-iris',
            adapterConfigPath: 'adapters.json',
            attemptTimeoutMs : 15000,
            instanceType     : 'userDataDir',
            instanceAddress  : '/seat/path',
            // Absent `--expected-seats` parses to an empty census, which the builder reads as "no
            // expectation" rather than "no seats" — the distinction that keeps a host-edge build quiet.
            expectedSeatIdentities: []
        });

        expect(parseManifestBuilderArgs(['--expected-seats', '@a, @b ,,@c']).expectedSeatIdentities,
            'the flag trims and drops empties rather than emitting blank identities'
        ).toEqual(['@a', '@b', '@c']);

        expect(parseManifestBuilderArgs([]).attemptTimeoutMs).toBeUndefined()
    });

    test('the real CLI produces a Codex route: codexBinary via --adapter-config, tuple via --instance', async () => {
        const dir = await tempDir();

        try {
            const codexSubscription = {
                ...webhookSubscription,
                id                   : 'WAKE_SUB:84dfc4da-0000-4000-8000-0000000000dd',
                harnessTargetMetadata: {
                    ...webhookSubscription.harnessTargetMetadata,
                    appName: 'Codex'
                }
            };

            const subsPath     = path.join(dir, 'subs.json'),
                  adapterPath  = path.join(dir, 'adapters.json'),
                  manifestPath = path.join(dir, 'routes.json'),
                  modulePath   = path.resolve(process.cwd(), 'ai/daemons/wake/buildReceiverManifest.mjs');

            await writeFile(subsPath, JSON.stringify({subscriptions: [codexSubscription]}));
            await writeFile(adapterPath, JSON.stringify({[codexSubscription.id]: {codexBinary: '/usr/local/bin/codex'}}));

            const {execFile} = await import('node:child_process'),
                  run        = new Promise((resolve, reject) => {
                      execFile(process.execPath, [
                          modulePath,
                          '--subscriptions', subsPath,
                          '--manifest', manifestPath,
                          '--identity', '@neo-opus-ada',
                          '--adapter-config', adapterPath,
                          '--instance', INSTANCE.type,
                          '--instance-address', INSTANCE.address
                      ], (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout));
                  });

            await run;

            const published = await readPublishedRoutes(manifestPath);

            expect(published[codexSubscription.id].adapterConfig).toEqual({
                attemptTimeoutMs: 10000,
                codexBinary     : '/usr/local/bin/codex',
                contextGate     : DEFAULT_CONTEXT_GATE
            });
            expect(published[codexSubscription.id].harnessTargetMetadata.addressType).toBe(INSTANCE.type);
            expect(published[codexSubscription.id].harnessTargetMetadata.appName).toBe('Codex')
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });
});

test.describe('readPublishedRoutes', () => {
    test('round-trips published routes for additive rebuilds', async () => {
        const dir = await tempDir();

        try {
            const target     = path.join(dir, 'routes.json'),
                  {manifest} = buildWakeReceiverManifest({subscriptions: [webhookSubscription], instance: INSTANCE});

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

test.describe('runManifestBuilder — the unrouted-seat warning at the consumer seam', () => {
    /**
     * The pure difference is trivial; what needed witnessing is that the BUILDER emits it, with the
     * exact identity and an actionable instruction, and that publication is unaffected. A helper-only
     * suite proves the arithmetic and says nothing about the shipped effect. Citing a green suite as
     * proof of lines no spec asserts is exactly the over-claim these arms exist to close.
     *
     * `expectedSeatIdentities` arrives as plain data on purpose: this module imports nothing from the
     * graph so host-edge tooling stays runnable without the plane. Absent input therefore means "no
     * expectation", not "no seats" — asserted below, because a guard that invents an expectation on a
     * host it knows nothing about is worse than one that stays quiet.
     */
    const runWithExpectations = async (dir, expectedSeatIdentities) => {
        const manifestPath = path.join(dir, 'routes.json'),
              input        = path.join(dir, 'subs.json'),
              lines        = [],
              logger       = {log: line => lines.push(line)};

        await writeFile(input, JSON.stringify({subscriptions: [webhookSubscription]}));

        const result = await runManifestBuilder({
            subscriptionsPath: input,
            manifestPath,
            instanceType     : INSTANCE.type,
            instanceAddress  : INSTANCE.address,
            expectedSeatIdentities,
            logger
        });

        return {lines, manifestPath, result}
    };

    test('one missing seat emits its exact identity and an actionable instruction; publication still succeeds', async () => {
        const dir = await tempDir();

        try {
            // `webhookSubscription` routes @neo-opus-ada; @neo-opus-vega is expected and absent.
            const {lines, manifestPath, result} = await runWithExpectations(
                dir, ['@neo-opus-ada', '@neo-opus-vega']
            );

            const warn = lines.find(line => line.includes('@neo-opus-vega'));

            expect(warn, 'the missing seat is named').toBeTruthy();
            expect(warn, 'and the line says who can fix it, since the tool acts on the caller')
                .toContain('manage_wake_subscription');

            expect(lines.some(line => line.includes('@neo-opus-ada') && line.includes('expected wake seat')),
                'the ROUTED seat must not be warned about').toBe(false);

            // Detection only: a provisioning gap must never block route generation for everyone else.
            expect(Object.keys(await readPublishedRoutes(manifestPath)),
                'publication still succeeds alongside the warning').toHaveLength(1);
            expect(result?.published, 'the builder still publishes').toBeTruthy();
            expect(result?.routeSummaries, 'and still reports its routes').toHaveLength(1)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('a fully routed expectation set emits nothing', async () => {
        const dir = await tempDir();

        try {
            const {lines} = await runWithExpectations(dir, ['@neo-opus-ada']);

            expect(lines.some(line => line.includes('expected wake seat')),
                'every expected seat is routed ⇒ silence').toBe(false)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    });

    test('no expectation input emits nothing — absence is not an empty census', async () => {
        const dir = await tempDir();

        try {
            const {lines} = await runWithExpectations(dir, undefined);

            expect(lines.some(line => line.includes('expected wake seat')),
                'a host-edge build with no roster must stay quiet rather than invent one').toBe(false)
        } finally {
            await rm(dir, {force: true, recursive: true})
        }
    })
});
