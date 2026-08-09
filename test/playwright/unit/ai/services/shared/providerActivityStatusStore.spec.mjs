import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'ProviderActivityStatusStoreTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'node:fs/promises';
import os             from 'node:os';
import path           from 'node:path';
import {
    createProviderActivityStatusWriter,
    inspectProviderActivityStatus,
    resolveProviderActivityStatusFile
} from '../../../../../../ai/services/shared/providerActivityStatusStore.mjs';
import {lifecycleGuardPath} from '../../../../../../ai/daemons/shared/lifecycleGuard.mjs';

test.describe('providerActivityStatusStore', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'provider-activity-status-'));
    });

    test.afterEach(async () => {
        await fs.rm(tmpDir, {recursive: true, force: true});
    });

    test('retains an in-window write failure after later success without exposing sensitive fields', async () => {
        const dbPath = path.join(tmpDir, 'shared.sqlite');
        const writer = createProviderActivityStatusWriter({dbPath, recorder: 'memory-core'});

        await writer.publishSuccess(100);
        await writer.publishFailure(200);
        await writer.publishSuccess(300);
        await writer.flush();

        const payload = JSON.parse(await fs.readFile(writer.file, 'utf8'));

        expect(payload).toEqual({
            schemaVersion: 1,
            recorder     : 'memory-core',
            lastSuccessAt: 300,
            lastFailureAt: 200
        });
        expect(Object.keys(payload).sort()).toEqual([
            'lastFailureAt',
            'lastSuccessAt',
            'recorder',
            'schemaVersion'
        ]);
        expect(inspectProviderActivityStatus({
            dbPath,
            sinceTs          : 150,
            requiredRecorders: ['memory-core']
        })).toEqual({status: 'partial'});
        expect(inspectProviderActivityStatus({
            dbPath,
            sinceTs          : 250,
            requiredRecorders: ['memory-core']
        })).toEqual({status: 'ok'});
    });

    test('keeps inspection read-only and reports a missing required owner as unavailable', async () => {
        const dbPath = path.join(tmpDir, 'shared.sqlite');

        expect(inspectProviderActivityStatus({dbPath, sinceTs: 0})).toEqual({status: 'unavailable'});

        const
            memoryWriter = createProviderActivityStatusWriter({dbPath, recorder: 'memory-core'}),
            kbWriter     = createProviderActivityStatusWriter({dbPath, recorder: 'knowledge-base'});

        await memoryWriter.publishSuccess(100);

        expect(inspectProviderActivityStatus({dbPath, sinceTs: 0})).toEqual({status: 'unavailable'});

        await kbWriter.publishSuccess(100);

        const beforeFiles   = await fs.readdir(tmpDir);
        const beforePayload = await fs.readFile(memoryWriter.file, 'utf8');

        expect(inspectProviderActivityStatus({dbPath, sinceTs: 0})).toEqual({status: 'ok'});
        expect(await fs.readdir(tmpDir)).toEqual(beforeFiles);
        expect(await fs.readFile(memoryWriter.file, 'utf8')).toBe(beforePayload);
        expect(resolveProviderActivityStatusFile(dbPath, 'knowledge-base')).toBe(kbWriter.file);
    });

    test('merges two pre-created process writers without erasing an earlier failure', async () => {
        const
            dbPath  = path.join(tmpDir, 'shared.sqlite'),
            writerA = createProviderActivityStatusWriter({dbPath, recorder: 'memory-core'}),
            writerB = createProviderActivityStatusWriter({dbPath, recorder: 'memory-core'});

        await writerA.publishFailure(200);
        await writerB.publishSuccess(300);

        expect(inspectProviderActivityStatus({
            dbPath,
            sinceTs          : 150,
            requiredRecorders: ['memory-core']
        })).toEqual({status: 'partial'});
        expect(JSON.parse(await fs.readFile(writerA.file, 'utf8'))).toEqual({
            schemaVersion: 1,
            recorder     : 'memory-core',
            lastSuccessAt: 300,
            lastFailureAt: 200
        });
    });

    test('retries a pending failure after live cross-process guard contention', async () => {
        const dbPath = path.join(tmpDir, 'shared.sqlite');
        const writer = createProviderActivityStatusWriter({dbPath, recorder: 'memory-core'});

        await writer.publishSuccess(100);

        const guardPath = lifecycleGuardPath(writer.file);

        const ownerPath = path.join(guardPath, 'owner-live-container-peer');

        await fs.mkdir(guardPath);
        await fs.writeFile(ownerPath, '');
        writer.publishFailure(200);

        expect(JSON.parse(await fs.readFile(writer.file, 'utf8'))).toEqual({
            schemaVersion: 1,
            recorder     : 'memory-core',
            lastSuccessAt: 100,
            lastFailureAt: null
        });

        await new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    await fs.unlink(ownerPath);
                    await fs.rmdir(guardPath);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, 1100);
        });
        await writer.flush();

        expect(inspectProviderActivityStatus({
            dbPath,
            sinceTs          : 150,
            requiredRecorders: ['memory-core']
        })).toEqual({status: 'partial'});
        expect(JSON.parse(await fs.readFile(writer.file, 'utf8'))).toEqual({
            schemaVersion: 1,
            recorder     : 'memory-core',
            lastSuccessAt: 100,
            lastFailureAt: 200
        });
    });

    test('never deletes a foreign failure after exhausting guard acquisition', async () => {
        const dbPath = path.join(tmpDir, 'shared.sqlite');
        const writer = createProviderActivityStatusWriter({dbPath, recorder: 'memory-core'});

        await writer.publishSuccess(100);

        const guardPath = lifecycleGuardPath(writer.file);

        const ownerPath = path.join(guardPath, 'owner-foreign-container');

        await fs.mkdir(guardPath);
        await fs.writeFile(ownerPath, '');
        await fs.writeFile(writer.file, JSON.stringify({
            schemaVersion: 1,
            recorder     : 'memory-core',
            lastSuccessAt: 100,
            lastFailureAt: 200
        }));

        writer.publishSuccess(300);
        await new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    await fs.unlink(ownerPath);
                    await fs.rmdir(guardPath);
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }, 1100);
        });
        await writer.flush();

        expect(JSON.parse(await fs.readFile(writer.file, 'utf8'))).toEqual({
            schemaVersion: 1,
            recorder     : 'memory-core',
            lastSuccessAt: 300,
            lastFailureAt: 200
        });
        expect(inspectProviderActivityStatus({
            dbPath,
            sinceTs          : 150,
            requiredRecorders: ['memory-core']
        })).toEqual({status: 'partial'});
    });

    test('recovers an abandoned guard beyond the writer stale horizon without a second publication', async () => {
        const dbPath = path.join(tmpDir, 'shared.sqlite');
        const writer = createProviderActivityStatusWriter({dbPath, recorder: 'memory-core'});

        await writer.publishSuccess(100);

        const guardPath = lifecycleGuardPath(writer.file);

        await fs.mkdir(guardPath);
        await fs.writeFile(path.join(guardPath, 'owner-abandoned-container'), '');
        writer.publishFailure(200);
        await writer.flush();

        expect(JSON.parse(await fs.readFile(writer.file, 'utf8'))).toEqual({
            schemaVersion: 1,
            recorder     : 'memory-core',
            lastSuccessAt: 100,
            lastFailureAt: 200
        });
        expect(inspectProviderActivityStatus({
            dbPath,
            sinceTs          : 150,
            requiredRecorders: ['memory-core']
        })).toEqual({status: 'partial'});
    });
});
