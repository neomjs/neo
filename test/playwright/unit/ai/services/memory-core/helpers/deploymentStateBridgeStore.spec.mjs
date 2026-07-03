import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {
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
});
