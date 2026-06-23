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
            ok    : true,
            status: 'available',
            ageMs : 100,
            snapshot
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
