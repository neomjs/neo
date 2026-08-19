import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {
    boundUtf8Head,
    boundUtf8Tail,
    createDeploymentStateSnapshot,
    readDeploymentStateSnapshot,
    writeDeploymentStateSnapshot
} from '../../../../../../../ai/services/memory-core/helpers/deploymentStateBridgeStore.mjs';

test.describe('deploymentStateBridgeStore', () => {
    test('writes and reads a fresh deployment-state snapshot', async () => {
        const dir      = await fs.mkdtemp(path.join(os.tmpdir(), 'deployment-state-bridge-')),
              filePath = path.join(dir, 'snapshot.json'),
              snapshot = createDeploymentStateSnapshot({
                  generatedAt: 1710000000000,
                  services   : [{serviceKey: 'model', status: 'available'}]
              });

        const written = await writeDeploymentStateSnapshot({filePath, snapshot});
        const read    = await readDeploymentStateSnapshot({filePath, now: 1710000000100});

        expect(written.ok).toBe(true);
        expect(read).toMatchObject({
            ok               : true,
            status           : 'available',
            ageMs            : 100,
            snapshot,
            schemaDiagnostics: {
                status                 : 'available',
                producerMetadataPresent: true,
                missingSections        : []
            }
        });
    });

    test('carries additive bridge diagnostics and self-heal status when provided, null by default (#14163 AC2)', () => {
        const bridgeDiagnostics = {status: 'degraded', reason: 'broad-service-lookup-failure'},
              selfHeal          = {status: 'available', summary: {total: 3, currentlyFrozen: ['c2']}, recentEvents: [{type: 'heal', at: 9}]},
              snapshot          = createDeploymentStateSnapshot({generatedAt: 1710000000000, bridgeDiagnostics, selfHeal});

        expect(snapshot.bridgeDiagnostics).toEqual(bridgeDiagnostics);
        expect(snapshot.selfHeal).toEqual(selfHeal);                       // passed through verbatim
        expect(snapshot.producer).toMatchObject({
            name    : 'orchestrator-deployment-state-bridge',
            sections: expect.arrayContaining(['bridgeDiagnostics', 'selfHeal', 'tenantRepoSync'])
        });
        expect(createDeploymentStateSnapshot({generatedAt: 1}).bridgeDiagnostics).toBeNull(); // additive + back-compat
        expect(createDeploymentStateSnapshot({generatedAt: 1}).selfHeal).toBeNull(); // additive + back-compat (omitted → null)
    });

    test('degrades fresh legacy snapshots without producer metadata (#14408)', async () => {
        const dir      = await fs.mkdtemp(path.join(os.tmpdir(), 'deployment-state-bridge-')),
              filePath = path.join(dir, 'snapshot.json'),
              snapshot = {
                  schemaVersion    : 1,
                  recordType       : 'deployment-state-snapshot',
                  generatedAt      : 1710000000000,
                  source           : 'orchestrator-deployment-state-bridge',
                  services         : [],
                  bridgeDiagnostics: null,
                  recoveryRuns     : null,
                  selfHeal         : null,
                  tenantRepoSync   : null
              };

        await writeDeploymentStateSnapshot({filePath, snapshot});

        await expect(readDeploymentStateSnapshot({filePath, now: 1710000000100})).resolves.toMatchObject({
            ok               : false,
            status           : 'degraded',
            reason           : 'snapshot-producer-metadata-missing',
            schemaDiagnostics: {
                status                 : 'degraded',
                producerMetadataPresent: false,
                missingSections        : []
            }
        });
    });

    test('degrades fresh snapshots missing current top-level sections (#14408)', async () => {
        const dir      = await fs.mkdtemp(path.join(os.tmpdir(), 'deployment-state-bridge-')),
              filePath = path.join(dir, 'snapshot.json'),
              snapshot = {
                  schemaVersion: 1,
                  recordType   : 'deployment-state-snapshot',
                  generatedAt  : 1710000000000,
                  source       : 'orchestrator-deployment-state-bridge',
                  producer     : {
                      name         : 'orchestrator-deployment-state-bridge',
                      schemaVersion: 1,
                      sections     : ['services']
                  },
                  services: []
              };

        await writeDeploymentStateSnapshot({filePath, snapshot});

        await expect(readDeploymentStateSnapshot({filePath, now: 1710000000100})).resolves.toMatchObject({
            ok               : false,
            status           : 'degraded',
            reason           : 'snapshot-section-missing',
            schemaDiagnostics: {
                status         : 'degraded',
                missingSections: expect.arrayContaining(['bridgeDiagnostics', 'recoveryRuns', 'selfHeal', 'tenantRepoSync'])
            }
        });
    });

    test('reports missing and stale snapshots explicitly', async () => {
        const dir      = await fs.mkdtemp(path.join(os.tmpdir(), 'deployment-state-bridge-')),
              filePath = path.join(dir, 'snapshot.json');

        await expect(readDeploymentStateSnapshot({filePath})).resolves.toMatchObject({
            ok    : false,
            status: 'unavailable',
            reason: 'snapshot-missing'
        });

        await writeDeploymentStateSnapshot({
            filePath,
            snapshot: createDeploymentStateSnapshot({generatedAt: 1000})
        });

        await expect(readDeploymentStateSnapshot({filePath, now: 10000, staleAfterMs: 1000})).resolves.toMatchObject({
            ok    : false,
            status: 'stale',
            reason: 'snapshot-stale'
        });
    });

    test('bounds log tails by UTF-8 bytes', () => {
        const bounded = boundUtf8Tail('0123456789', 4);

        expect(bounded).toEqual({
            text     : '6789',
            truncated: true,
            maxBytes : 4
        });
    });

    test('bounds log HEADS from the opposite end, cut on a line boundary (#17357)', () => {
        // The twin of the tail bound, and the contrast IS the test: same input, same cap, opposite
        // survivor. A tail keeps the end because that is where a death is written; a head keeps the
        // beginning because that is where a process reports what it decided, exactly once.
        expect(boundUtf8Tail('0123456789', 4).text).toBe('6789');
        expect(boundUtf8Head('0123456789', 4).text).toBe('0123');

        // Cuts back to the last complete line, which the tail deliberately does not: a truncated head
        // is read FORWARD by a human hunting a reported value, so a dangling half-line invites
        // misreading a number that was cut in two.
        const lines = boundUtf8Head('aaaa\nbbbb\ncccc\n', 7);

        expect(lines.text).toBe('aaaa\n');
        expect(lines.truncated).toBe(true);

        // A single line longer than the whole budget still yields bytes rather than nothing — an
        // over-long line is evidence, and returning '' would read as "printed nothing".
        expect(boundUtf8Head('xxxxxxxxxx', 4)).toEqual({text: 'xxxx', truncated: true, maxBytes: 4});

        // Under the cap: untouched and not marked truncated, matching its twin.
        expect(boundUtf8Head('short\n', 1024)).toEqual({text: 'short\n', truncated: false, maxBytes: 1024});

        // Degenerate caps behave as the twin does rather than throwing.
        expect(boundUtf8Head('abc', 0)).toEqual({text: '', truncated: true, maxBytes: 0});
        expect(boundUtf8Head(null, 8)).toEqual({text: '', truncated: false, maxBytes: 8});
    });
});

test.describe('#17049 — heavyMaintenanceStarvation snapshot section', () => {
    test('tolerated-absent: omitted when null/undefined, carried verbatim when present', () => {
        expect('heavyMaintenanceStarvation' in createDeploymentStateSnapshot({})).toBe(false);
        expect('heavyMaintenanceStarvation' in createDeploymentStateSnapshot({heavyMaintenanceStarvation: null})).toBe(false);

        const block = {taskName: 'heavy-maintenance-starvation-watchdog', posture: 'degraded', breaches: []};
        expect(createDeploymentStateSnapshot({heavyMaintenanceStarvation: block}).heavyMaintenanceStarvation).toEqual(block);
    });

    test('the section is REGISTERED: producer metadata declares it and sanitization preserves the declaration', () => {
        // An emitted-but-undeclared section is wire-format drift: the producer cannot claim it and
        // sanitizeProducerMetadata() strips it, so consumers can never trust its presence. The
        // default producer metadata must therefore carry the section name end-to-end.
        const snapshot = createDeploymentStateSnapshot({
            heavyMaintenanceStarvation: {taskName: 'heavy-maintenance-starvation-watchdog', posture: 'healthy', breaches: []}
        });

        expect(snapshot.producer.sections).toContain('heavyMaintenanceStarvation');
        expect(snapshot.producer.sections).toContain('maintenance');
    });
});
