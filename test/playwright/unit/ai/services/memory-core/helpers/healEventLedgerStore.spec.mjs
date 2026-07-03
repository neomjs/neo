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
    summarizeHealLedger,
    queryHealLedger,
    pruneHealLedger,
    validateHealLedgerRetention,
    healEventsToRecentRuns
} from '../../../../../../../ai/services/memory-core/helpers/healEventLedgerStore.mjs';
import {decideHealAction} from '../../../../../../../ai/services/memory-core/helpers/healActionDispatch.mjs';

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

test.describe('queryHealLedger — the filtered "what happened" surface', () => {
    const sample = [
        {type: 'heal',     collection: 'c1', status: 'healed',    at: 10},
        {type: 'freeze',   collection: 'c2', status: 'contained', at: 20},
        {type: 'heal',     collection: 'c1', status: 'failed',    at: 30},
        {type: 'unfreeze', collection: 'c2', status: 'unfrozen',  at: 40}
    ];

    test('returns newest-first by `at`', () => {
        expect(queryHealLedger(sample).map(e => e.at)).toEqual([40, 30, 20, 10]);
    });

    test('time window (sinceMs / untilMs, inclusive)', () => {
        expect(queryHealLedger(sample, {sinceMs: 20, untilMs: 30}).map(e => e.at)).toEqual([30, 20]);
    });

    test('filters by type / collection / status', () => {
        expect(queryHealLedger(sample, {types: ['freeze', 'unfreeze']}).map(e => e.type)).toEqual(['unfreeze', 'freeze']);
        expect(queryHealLedger(sample, {collections: ['c1']}).map(e => e.at)).toEqual([30, 10]);
        expect(queryHealLedger(sample, {statuses: ['failed']}).map(e => e.at)).toEqual([30]);
    });

    test('combined filters intersect', () => {
        expect(queryHealLedger(sample, {collections: ['c2'], types: ['freeze']}).map(e => e.at)).toEqual([20]);
    });

    test('limit caps the result newest-first', () => {
        expect(queryHealLedger(sample, {limit: 2}).map(e => e.at)).toEqual([40, 30]);
        expect(queryHealLedger(sample, {limit: 0})).toEqual([]);
    });

    test('drops non-objects, and excludes untimed events when a time bound is requested', () => {
        const withGarbage = [null, 'nope', {type: 'heal', status: 'healed'} /* no at */, {type: 'heal', status: 'healed', at: 50}];
        expect(queryHealLedger(withGarbage).length).toBe(2);                          // both objects, no time bound
        expect(queryHealLedger(withGarbage, {sinceMs: 0}).map(e => e.at)).toEqual([50]); // untimed excluded under a bound
        expect(queryHealLedger(undefined)).toEqual([]);
    });
});

test.describe('healEventsToRecentRuns — the ledger→dispatch anti-thrash shape seam', () => {
    test('projects each ledger entry type → action, keeping collection + the epoch-ms at', () => {
        const events = [
            {type: 're-embed-missing', collection: 'neo-agent-memory', status: 'attempt', at: 1000},
            {type: 're-embed-missing', collection: 'neo-agent-memory', status: 'attempt', at: 2000},
            null,
            'garbage'
        ];

        expect(healEventsToRecentRuns(events)).toEqual([
            {action: 're-embed-missing', collection: 'neo-agent-memory', at: 1000},
            {action: 're-embed-missing', collection: 'neo-agent-memory', at: 2000}
        ]);
        expect(healEventsToRecentRuns()).toEqual([]);
    });

    test('DOUBLE-COUNT GUARD: an outcome row alongside its attempt projects to ONE run, not two', () => {
        // recordRun writes status:'attempt' (the anti-thrash unit); recordHealOutcome writes the OUTCOME
        // (failed/healed/...) under the SAME {type, collection}. Counting both would double the run-count and
        // silently tighten the rate-limit + drag the cooldown to the outcome-time — keep only the attempt.
        const events = [
            {type: 're-embed-missing', collection: 'neo-agent-memory', status: 'attempt', at: 1000},
            {type: 're-embed-missing', collection: 'neo-agent-memory', status: 'failed', detail: 'boom', at: 1500}
        ];

        expect(healEventsToRecentRuns(events)).toEqual([
            {action: 're-embed-missing', collection: 'neo-agent-memory', at: 1000}
        ]);
    });

    test('REGRESSION: a just-recorded ledger attempt cools down the next dispatch (raw shape would not)', async () => {
        // The wired production seam: recordRun appends {type: action, ...}; the bug was recentRunsReader
        // returning the raw {type} entries, which decideHealAction (filtering recentRuns by run.action) never
        // matched -> a just-recorded attempt re-executed with no anti-thrash. Prove the projection fixes it.
        const dir = await tmpDir();

        try {
            const now = 1_000_000;

            await appendHealEvent({type: 're-embed-missing', collection: 'neo-agent-memory', status: 'attempt'}, {dir, now});

            const ledgerRuns = queryHealLedger(await readHealLedger({dir}), {collections: ['neo-agent-memory']}),
                  recentRuns = healEventsToRecentRuns(ledgerRuns);

            // Projected shape: action matches -> within the default cooldown window -> thrash-cooldown.
            const fixed = decideHealAction({action: 're-embed-missing', collection: 'neo-agent-memory', recentRuns, now: now + 1000});
            expect(fixed.status).toBe('thrash-cooldown');
            expect(fixed.execute).toBe(false);

            // Raw (unprojected) ledger shape: no run.action -> the filter never matches -> the bug (re-execute).
            const buggy = decideHealAction({action: 're-embed-missing', collection: 'neo-agent-memory', recentRuns: ledgerRuns, now: now + 1000});
            expect(buggy.status).toBe('execute');
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });
});

test.describe('pruneHealLedger + self-bounding append — bounded retention (#14163 AC3, sibling of #14128)', () => {
    test('keep-most-recent: prunes the oldest, retains the newest maxEvents in append order', async () => {
        const dir = await tmpDir();
        try {
            for (let i = 0; i < 6; i++) {
                await appendHealEvent({type: 'heal', collection: 'c1', status: 'healed', at: i}, {dir, triggerBytes: Infinity});
            }
            expect(await pruneHealLedger({dir, maxEvents: 4})).toEqual({pruned: 2, retained: 4});
            expect((await readHealLedger({dir})).map(e => e.at)).toEqual([2, 3, 4, 5]); // oldest 0,1 dropped; order kept
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('no-op at/under the cap and on a missing ledger (pruned: 0)', async () => {
        const dir = await tmpDir(), emptyDir = await tmpDir();
        try {
            await appendHealEvent({type: 'heal', collection: 'c1', status: 'healed', at: 1}, {dir, triggerBytes: Infinity});
            expect(await pruneHealLedger({dir, maxEvents: 5})).toEqual({pruned: 0, retained: 1});
            expect(await pruneHealLedger({dir: emptyDir, maxEvents: 5})).toEqual({pruned: 0, retained: 0});
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
            await fs.rm(emptyDir, {recursive: true, force: true});
        }
    });

    test('guards the required dir arg', async () => {
        await expect(pruneHealLedger({})).rejects.toThrow(/dir is required/);
    });

    test('self-bounding append: the byte-gate fires an amortized prune so the ledger never grows past the cap', async () => {
        const dir = await tmpDir();
        try {
            // triggerBytes:1 arms the gate on every append; maxEvents:3 is the retained cap. Append 5 → the gate
            // prunes to the newest 3 as soon as the file crosses 1 byte — proving the observability sink self-bounds.
            for (let i = 0; i < 5; i++) {
                await appendHealEvent({type: 'heal', collection: 'c1', status: 'healed', at: i}, {dir, triggerBytes: 1, maxEvents: 3});
            }
            const events = await readHealLedger({dir});
            expect(events.length).toBeLessThanOrEqual(3);     // bounded — never unbounded growth under sustained operation
            expect(events.at(-1).at).toBe(4);                 // the newest event always survives
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('appendHealEvent does NOT auto-prune when no retention policy is supplied — the helper owns no production default', async () => {
        const dir = await tmpDir();
        try {
            // 6 tiny appends with NO triggerBytes/maxEvents → the size-gate is inert (no magic-number fallback fires).
            // Bounding is the AiConfig-aware caller's job (it passes the retention leaves), not the helper's.
            for (let i = 0; i < 6; i++) {
                await appendHealEvent({type: 'heal', collection: 'c1', status: 'healed', at: i}, {dir});
            }
            expect((await readHealLedger({dir})).length).toBe(6); // un-pruned — no helper default applied
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });

    test('pruneHealLedger requires an explicit finite, non-negative maxEvents (no helper-owned default)', async () => {
        const dir = await tmpDir();
        try {
            await expect(pruneHealLedger({dir})).rejects.toThrow(/finite, non-negative maxEvents is required/);
            await expect(pruneHealLedger({dir, maxEvents: -1})).rejects.toThrow(/finite, non-negative maxEvents is required/);
            await expect(pruneHealLedger({dir, maxEvents: NaN})).rejects.toThrow(/finite, non-negative maxEvents is required/);
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });
});

test.describe('readHealLedger — fail-visible on an unreadable FILE (#14163 degradation surfaces)', () => {
    test('THROWS on an unreadable ledger FILE (non-ENOENT) so the observability boundary degrades visibly', async () => {
        const dir = await tmpDir();
        try {
            // A directory where the JSONL file should be → readFile throws EISDIR (NOT ENOENT). A MISSING file stays
            // [] (nothing yet); an unreadable file is a real storage degradation that must surface, not read as empty.
            await fs.mkdir(getHealLedgerFilePath(dir));
            await expect(readHealLedger({dir})).rejects.toMatchObject({code: 'EISDIR'});
        } finally {
            await fs.rm(dir, {recursive: true, force: true});
        }
    });
});

test.describe('validateHealLedgerRetention — fail-visible boundary guard (#14163 cycle-4)', () => {
    test('returns the validated pair for finite, non-negative values', () => {
        expect(validateHealLedgerRetention(5000, 1024 * 1024)).toEqual({maxEvents: 5000, triggerBytes: 1024 * 1024});
    });

    test('THROWS on an invalid maxEvents so an invalid retention leaf cannot silently disable the bound', () => {
        // The exact falsifier: maxEvents -1 made pruneHealLedger throw, which appendHealEvent's prune gate SWALLOWED
        // → the ledger grew unbounded. This boundary guard rejects the invalid leaf BEFORE the append instead.
        for (const bad of [-1, NaN, Infinity, '5000', null]) {
            expect(() => validateHealLedgerRetention(bad, 1024)).toThrow(/maxEvents must be a finite, non-negative number/);
        }
    });

    test('THROWS on an invalid pruneTriggerBytes', () => {
        for (const bad of [-1, NaN, Infinity]) {
            expect(() => validateHealLedgerRetention(5000, bad)).toThrow(/pruneTriggerBytes must be a finite, non-negative number/);
        }
    });
});
