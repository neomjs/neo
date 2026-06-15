import {test, expect} from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import fs              from 'fs/promises';
import {mkdtemp, rm}   from 'fs/promises';
import os              from 'os';
import path            from 'path';

import {
    appendWalEmbedMarker,
    appendWalGraphProjectionMarker,
    appendWalMemory,
    getMissingMemoryWalLeaves,
    getWalGraphMarkersFileName,
    getWalMarkersFileName,
    getWalRecordsFileName,
    getWalSegmentKey,
    pruneReconciledWalSegments,
    readPendingWalRecords
} from '../../../../../../../ai/services/memory-core/helpers/memoryWalStore.mjs';

/**
 * memoryWalStore — the durable JSONL write-ahead substrate behind the never-fail
 * `add_memory` write path. Falsifier coverage for the store contract:
 *
 *   - append → pending; embed-marker → reconciled (no longer pending)
 *   - graph-projection marker is separate from embed reconciliation
 *   - reads tolerate corrupt/torn lines and a missing directory
 *   - pruning removes ONLY fully-reconciled, non-active segments beyond the retention bound —
 *     a pending payload is never lost to retention
 */
test.describe('Neo.ai.services.memory-core.helpers.memoryWalStore', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-memory-wal-store-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    const record = (id, segmentMs) => ({
        id,
        timestamp: segmentMs,
        metadata : {prompt: `p-${id}`, response: `r-${id}`, thought: `t-${id}`},
        document : `doc-${id}`
    });

    const DAY1 = Date.UTC(2026, 5, 1, 12);
    const DAY2 = Date.UTC(2026, 5, 2, 12);
    const DAY3 = Date.UTC(2026, 5, 3, 12);

    test('derives UTC day segment keys and portable file names', () => {
        expect(getWalSegmentKey(DAY1)).toBe('2026-06-01');
        expect(getWalRecordsFileName('2026-06-01')).toBe('wal-2026-06-01.jsonl');
        expect(getWalMarkersFileName('2026-06-01')).toBe('wal-2026-06-01.embedded.jsonl');
        expect(getWalGraphMarkersFileName('2026-06-01')).toBe('wal-2026-06-01.graph.jsonl');
    });

    test('appendWalMemory writes the full payload into its day segment and reports the key', async () => {
        const {filePath, segmentKey} = await appendWalMemory(record('m1', DAY1), {dir: tmpDir});

        expect(segmentKey).toBe('2026-06-01');
        expect(filePath).toBe(path.join(tmpDir, 'wal-2026-06-01.jsonl'));

        const lines = (await fs.readFile(filePath, 'utf8')).trim().split('\n');
        expect(lines).toHaveLength(1);

        const entry = JSON.parse(lines[0]);
        expect(entry.id).toBe('m1');
        expect(entry.segmentKey).toBe('2026-06-01');
        expect(entry.metadata.prompt).toBe('p-m1');
        expect(entry.document).toBe('doc-m1');
    });

    test('appendWalMemory and appendWalEmbedMarker reject missing required inputs', async () => {
        await expect(appendWalMemory(record('m1', DAY1), {})).rejects.toThrow('dir is required');
        await expect(appendWalMemory({timestamp: DAY1}, {dir: tmpDir})).rejects.toThrow('record.id is required');
        await expect(appendWalEmbedMarker({id: 'm1'}, {dir: tmpDir})).rejects.toThrow('id and segmentKey are required');
        await expect(appendWalGraphProjectionMarker({id: 'm1'}, {dir: tmpDir})).rejects.toThrow('id and segmentKey are required');
    });

    test('readPendingWalRecords returns appended records until their embed marker lands', async () => {
        await appendWalMemory(record('m1', DAY1), {dir: tmpDir});
        await appendWalMemory(record('m2', DAY1), {dir: tmpDir});

        expect((await readPendingWalRecords({dir: tmpDir})).map(r => r.id)).toEqual(['m1', 'm2']);

        await appendWalEmbedMarker({id: 'm1', segmentKey: '2026-06-01'}, {dir: tmpDir});

        expect((await readPendingWalRecords({dir: tmpDir})).map(r => r.id)).toEqual(['m2']);
    });

    test('graph-projection pending state is tracked independently from embed reconciliation', async () => {
        await appendWalMemory(record('legacy', DAY1), {dir: tmpDir});
        await appendWalMemory({...record('m1', DAY1), graphProjectionVersion: 1}, {dir: tmpDir});

        await appendWalEmbedMarker({id: 'm1', segmentKey: '2026-06-01'}, {dir: tmpDir});

        expect((await readPendingWalRecords({dir: tmpDir})).map(r => r.id)).toEqual(['legacy']);
        expect((await readPendingWalRecords({dir: tmpDir, markerType: 'graph'})).map(r => r.id)).toEqual(['m1']);

        await appendWalGraphProjectionMarker({id: 'm1', segmentKey: '2026-06-01'}, {dir: tmpDir});

        expect((await readPendingWalRecords({dir: tmpDir, markerType: 'graph'})).map(r => r.id)).toEqual([]);
    });

    test('readPendingWalRecords filters by ids, bounds by limit, and reads newest segments first', async () => {
        await appendWalMemory(record('old', DAY1), {dir: tmpDir});
        await appendWalMemory(record('new-a', DAY2), {dir: tmpDir});
        await appendWalMemory(record('new-b', DAY2), {dir: tmpDir});

        expect((await readPendingWalRecords({dir: tmpDir, ids: ['new-b']})).map(r => r.id)).toEqual(['new-b']);

        // Newest segment first; limit applies across segments.
        expect((await readPendingWalRecords({dir: tmpDir, limit: 2})).map(r => r.id)).toEqual(['new-a', 'new-b']);
    });

    test('reads tolerate a torn line and a missing directory', async () => {
        const {filePath} = await appendWalMemory(record('m1', DAY1), {dir: tmpDir});
        await fs.appendFile(filePath, '{"id":"torn-mid-append', 'utf8');

        expect((await readPendingWalRecords({dir: tmpDir})).map(r => r.id)).toEqual(['m1']);
        expect(await readPendingWalRecords({dir: path.join(tmpDir, 'missing')})).toEqual([]);
    });

    test('pruning removes only fully-reconciled, non-active segments beyond the retention bound', async () => {
        // Three reconciled segments + one with a pending record.
        for (const [id, ms, key] of [['a', DAY1, '2026-06-01'], ['b', DAY2, '2026-06-02'], ['c', DAY3, '2026-06-03']]) {
            await appendWalMemory({...record(id, ms), graphProjectionVersion: 1}, {dir: tmpDir});
            await appendWalEmbedMarker({id, segmentKey: key}, {dir: tmpDir});
            await appendWalGraphProjectionMarker({id, segmentKey: key}, {dir: tmpDir});
        }
        await appendWalMemory(record('pending', Date.UTC(2026, 4, 30, 12)), {dir: tmpDir}); // 2026-05-30

        const removed = await pruneReconciledWalSegments({dir: tmpDir, retentionLimit: 1, activeSegmentKey: '2026-06-03'});

        // Reconciled candidates (newest-first, active excluded): 06-02, 06-01 → keep 1, remove 1.
        expect(removed).toBe(1);

        const names = await fs.readdir(tmpDir);
        expect(names).toContain('wal-2026-06-03.jsonl');      // active — never pruned
        expect(names).toContain('wal-2026-06-02.jsonl');      // newest reconciled within bound
        expect(names).not.toContain('wal-2026-06-01.jsonl');  // beyond bound — removed
        expect(names).toContain('wal-2026-05-30.jsonl');      // pending payload — NEVER pruned

        // A pending record survives any retention pressure.
        expect((await readPendingWalRecords({dir: tmpDir})).map(r => r.id)).toEqual(['pending']);
    });

    test('pruning preserves graph-projection-pending records even after embed reconciliation', async () => {
        await appendWalMemory({...record('graph-pending', DAY1), graphProjectionVersion: 1}, {dir: tmpDir});
        await appendWalEmbedMarker({id: 'graph-pending', segmentKey: '2026-06-01'}, {dir: tmpDir});

        await appendWalMemory(record('old-style-reconciled-a', DAY2), {dir: tmpDir});
        await appendWalEmbedMarker({id: 'old-style-reconciled-a', segmentKey: '2026-06-02'}, {dir: tmpDir});
        await appendWalMemory(record('old-style-reconciled-b', DAY3), {dir: tmpDir});
        await appendWalEmbedMarker({id: 'old-style-reconciled-b', segmentKey: '2026-06-03'}, {dir: tmpDir});

        const removed = await pruneReconciledWalSegments({dir: tmpDir, retentionLimit: 1, activeSegmentKey: '2026-06-04'});
        expect(removed).toBe(1);

        const names = await fs.readdir(tmpDir);
        expect(names).toContain('wal-2026-06-01.jsonl');
        expect(names).not.toContain('wal-2026-06-02.jsonl');
        expect(names).toContain('wal-2026-06-03.jsonl');
    });

    test('pruning is a no-op without a positive retention bound or with a missing directory', async () => {
        expect(await pruneReconciledWalSegments({dir: tmpDir, retentionLimit: 0})).toBe(0);
        expect(await pruneReconciledWalSegments({dir: path.join(tmpDir, 'missing'), retentionLimit: 5})).toBe(0);
    });

    test('getMissingMemoryWalLeaves names exactly the absent leaves (stale-overlay guard, pure predicate)', () => {
        // Block absent entirely (overlay predates the memoryWal block): every consumer leaf missing.
        expect(getMissingMemoryWalLeaves(undefined, ['dir', 'minFieldLength'])).toEqual(['dir', 'minFieldLength']);

        // Partially stale overlay (block exists, daemon leaves predate it): only those surface.
        const phase1Slice = {dir: '/tmp/wal', retentionLimit: 30, minFieldLength: 1};
        expect(getMissingMemoryWalLeaves(phase1Slice, ['dir', 'pollIntervalMs', 'batchSize'])).toEqual(['pollIntervalMs', 'batchSize']);

        // Current slice: nothing missing — the consumer proceeds.
        expect(getMissingMemoryWalLeaves({...phase1Slice, pollIntervalMs: 5000, batchSize: 20}, ['dir', 'pollIntervalMs', 'batchSize'])).toEqual([]);

        // `null` is treated as absent (no hidden fallback may paper over it).
        expect(getMissingMemoryWalLeaves({dir: null}, ['dir'])).toEqual(['dir']);
    });
});
