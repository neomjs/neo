import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import {
    getFreezeRecordsFilePath,
    readFreezeRecords,
    getFreezeRecord,
    upsertFreezeRecord,
    removeFreezeRecord
} from '../../../../../../../ai/services/memory-core/helpers/freezeRecordStore.mjs';

async function tmpDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'freeze-records-'));
}

test.describe('freezeRecordStore — durable mutable freeze-state', () => {
    test('upsert → read round-trips a record', async () => {
        const dir = await tmpDir();
        await upsertFreezeRecord({dir, collectionName: 'neo-native-graph', faultFingerprint: 'fp-1', frozenAt: 100, unfreezeAttempts: 0, lastProbeAt: 100});

        expect(await getFreezeRecord({dir, collectionName: 'neo-native-graph'}))
            .toMatchObject({collectionName: 'neo-native-graph', faultFingerprint: 'fp-1', frozenAt: 100, unfreezeAttempts: 0, lastProbeAt: 100});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a missing file reads as an empty set (fail-safe → nothing frozen)', async () => {
        const dir = await tmpDir();
        expect(await readFreezeRecords({dir})).toEqual({});
        expect(await getFreezeRecord({dir, collectionName: 'absent'})).toBeNull();
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a corrupt file reads as an empty set, never throws', async () => {
        const dir = await tmpDir();
        await fs.writeFile(getFreezeRecordsFilePath(dir), '{ not json', 'utf8');
        expect(await readFreezeRecords({dir})).toEqual({});

        await fs.writeFile(getFreezeRecordsFilePath(dir), JSON.stringify(['array-not-map']), 'utf8');
        expect(await readFreezeRecords({dir})).toEqual({}); // a non-object map degrades to empty
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('upsert merges — a partial update preserves prior fields (bump lastProbeAt, keep frozenAt)', async () => {
        const dir = await tmpDir();
        await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'fp', frozenAt: 100, unfreezeAttempts: 0, lastProbeAt: 100});
        await upsertFreezeRecord({dir, collectionName: 'c1', lastProbeAt: 700, unfreezeAttempts: 1}); // a probe tick

        expect(await getFreezeRecord({dir, collectionName: 'c1'}))
            .toMatchObject({collectionName: 'c1', faultFingerprint: 'fp', frozenAt: 100, unfreezeAttempts: 1, lastProbeAt: 700});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('multiple collections are keyed independently', async () => {
        const dir = await tmpDir();
        await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'fp1'});
        await upsertFreezeRecord({dir, collectionName: 'c2', faultFingerprint: 'fp2'});

        const records = await readFreezeRecords({dir});
        expect(Object.keys(records).sort()).toEqual(['c1', 'c2']);
        expect(records.c1.faultFingerprint).toBe('fp1');
        expect(records.c2.faultFingerprint).toBe('fp2');
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('remove deletes one record (true), leaves the rest, and is a no-op when absent (false)', async () => {
        const dir = await tmpDir();
        await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'fp1'});
        await upsertFreezeRecord({dir, collectionName: 'c2', faultFingerprint: 'fp2'});

        expect(await removeFreezeRecord({dir, collectionName: 'c1'})).toBe(true);
        expect(await getFreezeRecord({dir, collectionName: 'c1'})).toBeNull();
        expect(await getFreezeRecord({dir, collectionName: 'c2'})).not.toBeNull(); // sibling intact

        expect(await removeFreezeRecord({dir, collectionName: 'c1'})).toBe(false); // already gone
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('upsert guards the required collectionName', async () => {
        const dir = await tmpDir();
        await expect(upsertFreezeRecord({dir})).rejects.toThrow(/collectionName is required/);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('null DELETES a field while undefined PRESERVES it — the tombstone re-activation null-clear (#14276)', async () => {
        const dir = await tmpDir();
        // a released tombstone carrying a climbing count + stale back-off / contained markers
        await upsertFreezeRecord({dir, collectionName: 'c1', faultFingerprint: 'e', frozenAt: 100, unfreezeAttempts: 2, lastProbeAt: 500, containedAt: 600, unfrozenAt: 700});

        // re-activation: set frozenAt, null-clear the released / back-off / contained markers, PRESERVE unfreezeAttempts (undefined)
        await upsertFreezeRecord({dir, collectionName: 'c1', frozenAt: 900, unfrozenAt: null, lastProbeAt: null, containedAt: null});

        const record = await getFreezeRecord({dir, collectionName: 'c1'});
        expect(record).toMatchObject({collectionName: 'c1', faultFingerprint: 'e', frozenAt: 900, unfreezeAttempts: 2}); // preserved (undefined) + overwritten (frozenAt)
        expect(record.unfrozenAt).toBeUndefined();  // null-cleared
        expect(record.lastProbeAt).toBeUndefined(); // null-cleared
        expect(record.containedAt).toBeUndefined(); // null-cleared
        await fs.rm(dir, {recursive: true, force: true});
    });
});
