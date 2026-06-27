import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import {
    getHealLedgerFilePath,
    appendHealEvent,
    readHealLedger,
    summarizeHealLedger
} from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';

async function tmpDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'heal-ledger-'));
}

test.describe('healEventLedgerStore — durable append-only heal ledger', () => {
    test('append → read round-trips in append order (oldest → newest)', async () => {
        const dir = await tmpDir();
        await appendHealEvent({type: 'heal', collection: 'c1', status: 'healed', at: 100}, {dir});
        await appendHealEvent({type: 'freeze', collection: 'c2', status: 'contained', at: 200}, {dir});

        const events = await readHealLedger({dir});
        expect(events.map(e => e.collection)).toEqual(['c1', 'c2']);
        expect(events[1]).toMatchObject({type: 'freeze', status: 'contained', at: 200});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a missing ledger reads as [] (nothing healed yet)', async () => {
        const dir = await tmpDir();
        expect(await readHealLedger({dir})).toEqual([]);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a corrupt line is skipped, the rest still read (fail-safe)', async () => {
        const dir = await tmpDir();
        await appendHealEvent({type: 'heal', collection: 'c1', status: 'healed', at: 1}, {dir});
        await fs.appendFile(getHealLedgerFilePath(dir), '{ not json\n', 'utf8');
        await appendHealEvent({type: 'heal', collection: 'c2', status: 'healed', at: 2}, {dir});

        const events = await readHealLedger({dir});
        expect(events.map(e => e.collection)).toEqual(['c1', 'c2']); // corrupt middle line dropped
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('append stamps `at` from the injected clock when absent', async () => {
        const dir = await tmpDir();
        await appendHealEvent({type: 'unfreeze', collection: 'c1', status: 'unfrozen'}, {dir, now: 777});
        expect((await readHealLedger({dir}))[0].at).toBe(777);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('append guards required args', async () => {
        const dir = await tmpDir();
        await expect(appendHealEvent(null, {dir})).rejects.toThrow(/entry object is required/);
        await expect(appendHealEvent({type: 'heal'}, {})).rejects.toThrow(/dir is required/);
        await fs.rm(dir, {recursive: true, force: true});
    });
});

test.describe('summarizeHealLedger — the queryable status surface', () => {
    test('counts by status and by type + reports the latest timestamp', () => {
        const summary = summarizeHealLedger([
            {type: 'heal',   collection: 'c1', status: 'healed', at: 10},
            {type: 'heal',   collection: 'c2', status: 'failed', at: 20},
            {type: 'freeze', collection: 'c3', status: 'contained', at: 30}
        ]);

        expect(summary.total).toBe(3);
        expect(summary.byStatus).toEqual({healed: 1, failed: 1, contained: 1});
        expect(summary.byType).toEqual({heal: 2, freeze: 1});
        expect(summary.lastEventAt).toBe(30);
    });

    test('folds freeze/unfreeze into the currently-frozen set (last transition wins)', () => {
        const summary = summarizeHealLedger([
            {type: 'freeze',   collection: 'c1', status: 'contained', at: 1},
            {type: 'freeze',   collection: 'c2', status: 'contained', at: 2},
            {type: 'unfreeze', collection: 'c1', status: 'unfrozen',  at: 3}, // c1 recovered
            {type: 'freeze',   collection: 'c3', status: 'contained', at: 4}
        ]);

        expect(summary.currentlyFrozen).toEqual(['c2', 'c3']); // c1 unfrozen, sorted
    });

    test('empty / garbage input yields safe defaults', () => {
        expect(summarizeHealLedger([])).toEqual({total: 0, byStatus: {}, byType: {}, currentlyFrozen: [], lastEventAt: null});
        expect(summarizeHealLedger(undefined).total).toBe(0);
        const withGarbage = summarizeHealLedger([null, {type: 'heal', status: 'healed', at: 5}, 'nope']);
        expect(withGarbage.total).toBe(3);          // counts rows
        expect(withGarbage.byStatus).toEqual({healed: 1}); // but only valid objects contribute
    });
});
