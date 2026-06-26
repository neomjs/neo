import {test, expect} from '@playwright/test';
import {
    buildCoverageTimeline,
    buildReport,
    detectCorruptionOnset,
    extractBackupCounts,
    readBackupEntries
} from '../../../../../../ai/scripts/maintenance/backupCorruptionTimeline.mjs';

/**
 * @summary Unit coverage for the read-only backup-corruption timeline diagnostic.
 * Fixture-based — never touches a real backup dir or the live store.
 * @see ai/scripts/maintenance/backupCorruptionTimeline.mjs
 */

const cleanMeta = (memories, chunks = 30000, graph = 100000) => ({
    completedAt: '2026-06-18T07:42:41Z',
    gitSha     : 'abc123',
    subsystems : {
        mc   : {message: `Export complete. Exported ${memories} memories, 1000 summaries, and 0 graph elements.`},
        kb   : {message: `Export complete. Exported ${chunks} knowledge base chunks.`},
        graph: {message: `Export complete. Exported 0 memories, 0 summaries, and ${graph} graph elements.`}
    }
});

test.describe('backupCorruptionTimeline — extractBackupCounts', () => {
    test('parses mc / kb / graph counts from a clean bundle-meta', () => {
        const counts = extractBackupCounts(cleanMeta(18835));

        expect(counts.mc).toEqual({memories: 18835, summaries: 1000});
        expect(counts.kb).toEqual({chunks: 30000});
        expect(counts.graph).toEqual({elements: 100000});
        expect(counts.completedAt).toBe('2026-06-18T07:42:41Z');
    });

    test('returns null for an absent or shapeless manifest (a failed export)', () => {
        expect(extractBackupCounts(null)).toBeNull();
        expect(extractBackupCounts({})).toBeNull();
        expect(extractBackupCounts({subsystems: {}})).toEqual({
            mc: null, kb: null, graph: null, completedAt: null, gitSha: null
        });
    });
});

test.describe('backupCorruptionTimeline — buildCoverageTimeline', () => {
    test('sorts chronologically and marks clean vs export-failed', () => {
        const timeline = buildCoverageTimeline([
            {timestamp: '2026-06-20T05-23Z', meta: null},
            {timestamp: '2026-06-18T07-42Z', meta: cleanMeta(18835)}
        ]);

        expect(timeline.map(r => r.timestamp)).toEqual(['2026-06-18T07-42Z', '2026-06-20T05-23Z']);
        expect(timeline[0].status).toBe('clean');
        expect(timeline[1].status).toBe('export-failed');
    });
});

test.describe('backupCorruptionTimeline — detectCorruptionOnset', () => {
    test('detects the clean → export-failed onset window (the live incident shape)', () => {
        const timeline = buildCoverageTimeline([
            {timestamp: '2026-06-17', meta: cleanMeta(18822)},
            {timestamp: '2026-06-18', meta: cleanMeta(18835)},
            {timestamp: '2026-06-20', meta: null}
        ]);

        const {onsetWindow} = detectCorruptionOnset(timeline, r => r.counts?.mc?.memories);

        expect(onsetWindow).toEqual({lastClean: '2026-06-18', firstDegraded: '2026-06-20'});
    });

    test('detects a count regression between consecutive clean backups (append-mostly loss)', () => {
        const timeline = buildCoverageTimeline([
            {timestamp: '2026-06-01', meta: cleanMeta(15000)},
            {timestamp: '2026-06-02', meta: cleanMeta(12000)}
        ]);

        const {drop} = detectCorruptionOnset(timeline, r => r.counts?.mc?.memories);

        expect(drop).toEqual({from: 15000, to: 12000, fromAt: '2026-06-01', at: '2026-06-02'});
    });

    test('a clean monotonic series yields no onset window and no drop', () => {
        const timeline = buildCoverageTimeline([
            {timestamp: '2026-06-01', meta: cleanMeta(15000)},
            {timestamp: '2026-06-02', meta: cleanMeta(15400)}
        ]);

        expect(detectCorruptionOnset(timeline, r => r.counts?.mc?.memories)).toEqual({onsetWindow: null, drop: null});
    });
});

test.describe('backupCorruptionTimeline — readBackupEntries (injected fs)', () => {
    test('reads backup-* dirs + their bundle-meta; null for a missing manifest; filters non-backups', async () => {
        const meta     = cleanMeta(18835),
              fsModule = {
                  pathExists: async p => !p.endsWith('backup-2026-06-20Z/bundle-meta.json'),
                  readdir   : async () => ['backup-2026-06-18Z', 'backup-2026-06-20Z', 'not-a-backup'],
                  readJson  : async () => meta
              };

        const entries = await readBackupEntries({backupsDir: '/x', fsModule});

        expect(entries.map(e => e.timestamp)).toEqual(['2026-06-18Z', '2026-06-20Z']);
        expect(entries[0].meta).toEqual(meta);
        expect(entries[1].meta).toBeNull();
    });

    test('returns [] when the backups dir does not exist', async () => {
        const entries = await readBackupEntries({backupsDir: '/nope', fsModule: {pathExists: async () => false}});

        expect(entries).toEqual([]);
    });
});

test.describe('backupCorruptionTimeline — buildReport', () => {
    test('aggregates totals + per-collection onset', () => {
        const timeline = buildCoverageTimeline([
            {timestamp: '2026-06-18', meta: cleanMeta(18835)},
            {timestamp: '2026-06-20', meta: null}
        ]);

        const report = buildReport(timeline, '/backups');

        expect(report.totalBackups).toBe(2);
        expect(report.cleanBackups).toBe(1);
        expect(report.onset.mc.onsetWindow).toEqual({lastClean: '2026-06-18', firstDegraded: '2026-06-20'});
    });
});
