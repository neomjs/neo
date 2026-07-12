import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import {
    getRouteAttributionLedgerFilePath,
    validateRouteAttributionRetention,
    appendRouteAttribution,
    readRouteAttributionLedger,
    pruneRouteAttributionLedger,
    summarizeRouteAttributionLedger,
    queryRouteAttributionLedger
} from '../../../../../../ai/services/graph/routeAttributionLedgerStore.mjs';

async function tmpDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'route-attribution-ledger-'));
}

// A guard-filtered candidate: the node the routing contradiction guard blocked, the live focus reasons that
// armed the guard, and the exclusion bucket that fired.
const record = (blockedNodeId, armingReasons, exclusionLabels, at) => ({blockedNodeId, armingReasons, exclusionLabels, at});

test.describe('routeAttributionLedgerStore — durable append-only route-attribution ledger (#15057)', () => {
    test('append → read round-trips in append order (oldest → newest)', async () => {
        const dir = await tmpDir();
        await appendRouteAttribution(record('issue-200', ['incident'], ['content'], 100), {dir});
        await appendRouteAttribution(record('issue-201', ['prio-zero'], ['content'], 200), {dir});

        const records = await readRouteAttributionLedger({dir});
        expect(records.map(r => r.blockedNodeId)).toEqual(['issue-200', 'issue-201']);
        expect(records[1]).toMatchObject({armingReasons: ['prio-zero'], at: 200});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a missing ledger reads as [] (nothing filtered yet, not a degradation)', async () => {
        const dir = await tmpDir();
        expect(await readRouteAttributionLedger({dir})).toEqual([]);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a corrupt line is skipped, the rest still read (fail-safe)', async () => {
        const dir = await tmpDir();
        await appendRouteAttribution(record('issue-1', ['incident'], ['content'], 1), {dir});
        await fs.appendFile(getRouteAttributionLedgerFilePath(dir), '{ not json\n', 'utf8');
        await appendRouteAttribution(record('issue-2', ['incident'], ['content'], 2), {dir});

        const records = await readRouteAttributionLedger({dir});
        expect(records.map(r => r.blockedNodeId)).toEqual(['issue-1', 'issue-2']);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('append stamps `at` from the injected clock when the entry omits it (time-ordered without a real clock)', async () => {
        const dir = await tmpDir();
        await appendRouteAttribution({blockedNodeId: 'issue-9', armingReasons: ['incident'], exclusionLabels: ['content']}, {dir, now: 4242});

        const [only] = await readRouteAttributionLedger({dir});
        expect(only.at).toBe(4242);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('append throws on a missing dir / non-object entry (fail-closed on caller misuse)', async () => {
        await expect(appendRouteAttribution(record('issue-1', ['incident'], ['content'], 1), {})).rejects.toThrow(/dir is required/);
        await expect(appendRouteAttribution(null, {dir: '/tmp/whatever'})).rejects.toThrow(/entry object is required/);
    });

    test('validateRouteAttributionRetention returns the pair when valid, throws visibly when not', () => {
        expect(validateRouteAttributionRetention(500, 65536)).toEqual({maxEvents: 500, triggerBytes: 65536});
        expect(() => validateRouteAttributionRetention(-1, 65536)).toThrow(/maxEvents must be a finite, non-negative number/);
        expect(() => validateRouteAttributionRetention(500, NaN)).toThrow(/pruneTriggerBytes must be a finite, non-negative number/);
    });

    test('prune keeps the most-recent maxEvents (append order is oldest→newest; the tail is retained)', async () => {
        const dir = await tmpDir();
        for (let i = 1; i <= 5; i++) await appendRouteAttribution(record(`issue-${i}`, ['incident'], ['content'], i), {dir});

        const result = await pruneRouteAttributionLedger({dir, maxEvents: 2});
        expect(result).toEqual({pruned: 3, retained: 2});

        const records = await readRouteAttributionLedger({dir});
        expect(records.map(r => r.blockedNodeId)).toEqual(['issue-4', 'issue-5']);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('append self-bounds only when the caller supplies retention (crossing triggerBytes fires the prune)', async () => {
        const dir = await tmpDir();
        // No retention supplied → auto-prune inert, all rows retained even past a byte threshold.
        for (let i = 1; i <= 6; i++) await appendRouteAttribution(record(`issue-${i}`, ['incident'], ['content'], i), {dir});
        expect((await readRouteAttributionLedger({dir})).length).toBe(6);

        // Retention supplied with a tiny byte-trigger → the next append fires the keep-most-recent prune.
        await appendRouteAttribution(record('issue-7', ['incident'], ['content'], 7), {dir, triggerBytes: 1, maxEvents: 3});
        const records = await readRouteAttributionLedger({dir});
        expect(records.map(r => r.blockedNodeId)).toEqual(['issue-5', 'issue-6', 'issue-7']);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('summarize folds the evidence surface the type-gate disposition reads', async () => {
        const dir = await tmpDir();
        await appendRouteAttribution(record('issue-200', ['incident'], ['content'], 100), {dir});
        await appendRouteAttribution(record('issue-200', ['prio-zero'], ['content', 'stale'], 200), {dir});
        await appendRouteAttribution(record('issue-201', ['incident'], ['content'], 300), {dir});

        const summary = summarizeRouteAttributionLedger(await readRouteAttributionLedger({dir}));
        expect(summary.total).toBe(3);
        expect(summary.byArmingReason).toEqual({incident: 2, 'prio-zero': 1});
        expect(summary.byExclusionLabel).toEqual({content: 3, stale: 1});
        expect(summary.blockedNodeCounts).toEqual({'issue-200': 2, 'issue-201': 1});
        expect(summary.lastEventAt).toBe(300);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('summarize on an empty stream is a well-formed zero surface (no NaN, no crash)', () => {
        expect(summarizeRouteAttributionLedger([])).toEqual({
            total: 0, byArmingReason: {}, byExclusionLabel: {}, blockedNodeCounts: {}, lastEventAt: null
        });
        expect(summarizeRouteAttributionLedger(undefined).total).toBe(0);
    });

    test('query filters by focus reason / node / time window and returns newest-first, capped at limit', () => {
        const records = [
            record('issue-200', ['incident'],  ['content'], 100),
            record('issue-201', ['prio-zero'], ['content'], 200),
            record('issue-200', ['incident'],  ['stale'],   300)
        ];

        // focus-reason intersection, newest-first
        expect(queryRouteAttributionLedger(records, {armingReasons: ['incident']}).map(r => r.at)).toEqual([300, 100]);
        // blocked-node filter
        expect(queryRouteAttributionLedger(records, {blockedNodeIds: ['issue-201']}).map(r => r.at)).toEqual([200]);
        // inclusive time window
        expect(queryRouteAttributionLedger(records, {sinceMs: 150, untilMs: 300}).map(r => r.at)).toEqual([300, 200]);
        // exclusion-label intersection
        expect(queryRouteAttributionLedger(records, {exclusionLabels: ['stale']}).map(r => r.at)).toEqual([300]);
        // limit caps the newest-first result
        expect(queryRouteAttributionLedger(records, {limit: 1}).map(r => r.at)).toEqual([300]);
    });

    test('getRouteAttributionLedgerFilePath fails closed on a missing dir', () => {
        expect(() => getRouteAttributionLedgerFilePath('')).toThrow(/dir is required/);
        expect(getRouteAttributionLedgerFilePath('/state/dir')).toBe(path.join('/state/dir', 'route-attribution.jsonl'));
    });
});
