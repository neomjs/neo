import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'fs/promises';
import os             from 'os';
import path           from 'path';
import {
    appendRouteAttribution,
    readRouteAttributionLedger,
    getRouteAttributionLedgerFilePath
} from '../../../../../../ai/services/graph/routeAttributionLedgerStore.mjs';
import {
    TYPE_GATE_REJECTION_FILENAME,
    TYPE_GATE_REJECTION_STAGE,
    DISCUSSION_LIVENESS_REJECTION_STAGE,
    appendTypeGateRejection,
    readTypeGateRejectionLedger,
    summarizeTypeGateRejectionLedger,
    queryTypeGateRejectionLedger
} from '../../../../../../ai/services/graph/typeGateRejectionLedgerStore.mjs';

async function tmpDir() {
    return await fs.mkdtemp(path.join(os.tmpdir(), 'type-gate-rejection-ledger-'));
}

// A type-gate rejection: the non-actionable node + the exclusion labels that made it visibility-only.
const record         = (nodeId, rejectionBucket, at) => ({nodeId, rejectionBucket, stage: TYPE_GATE_REJECTION_STAGE, at});
const livenessRecord = (nodeId, rejectionBucket, at) => ({
    nodeId,
    rejectionBucket,
    stage: DISCUSSION_LIVENESS_REJECTION_STAGE,
    at
});

test.describe('typeGateRejectionLedgerStore — the actionability type-gate rejection ledger (#15057 AC3)', () => {
    test('append (via the shared filename seam) → read round-trips the sibling ledger in append order', async () => {
        const dir = await tmpDir();
        await appendRouteAttribution(record('issue-10', ['epic'], 100), {dir, filename: TYPE_GATE_REJECTION_FILENAME});
        await appendRouteAttribution(record('issue-11', ['not-code-ready'], 200), {dir, filename: TYPE_GATE_REJECTION_FILENAME});

        const records = await readTypeGateRejectionLedger({dir});
        expect(records.map(r => r.nodeId)).toEqual(['issue-10', 'issue-11']);
        expect(records[1]).toMatchObject({rejectionBucket: ['not-code-ready'], stage: TYPE_GATE_REJECTION_STAGE, at: 200});
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('the two filter points are queryable-APART — a route-attribution write does not leak into the type-gate read', async () => {
        const dir = await tmpDir();
        // route-attribution (guard) write → route-attribution.jsonl (no filename)
        await appendRouteAttribution({blockedNodeId: 'issue-guard', armingReasons: ['incident'], at: 1}, {dir});
        // type-gate write → the sibling type-gate-rejection.jsonl
        await appendRouteAttribution(record('issue-typegate', ['epic'], 2), {dir, filename: TYPE_GATE_REJECTION_FILENAME});

        const typeGate = await readTypeGateRejectionLedger({dir});
        expect(typeGate.map(r => r.nodeId)).toEqual(['issue-typegate']);        // only the type-gate record
        // and the route-attribution ledger stays clean of the type-gate record
        const route = await readRouteAttributionLedger({dir});
        expect(route.map(r => r.blockedNodeId)).toEqual(['issue-guard']);
        // they are genuinely distinct files in the one dir
        expect(getRouteAttributionLedgerFilePath(dir, TYPE_GATE_REJECTION_FILENAME))
            .not.toBe(getRouteAttributionLedgerFilePath(dir));
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('a missing ledger reads as [] (nothing rejected yet, not a degradation)', async () => {
        const dir = await tmpDir();
        expect(await readTypeGateRejectionLedger({dir})).toEqual([]);
        await fs.rm(dir, {recursive: true, force: true});
    });

    test('one physical stream exposes stage-isolated defaults and explicit liveness views', async () => {
        const dir = await tmpDir();
        await appendRouteAttribution(record('issue-actionability', ['epic'], 100), {dir, filename: TYPE_GATE_REJECTION_FILENAME});
        await appendRouteAttribution(livenessRecord('discussion-dormant', ['undetermined-no-decaying-support'], 200), {dir, filename: TYPE_GATE_REJECTION_FILENAME});

        expect((await readTypeGateRejectionLedger({dir})).map(row => row.nodeId)).toEqual(['issue-actionability']);
        expect((await readTypeGateRejectionLedger({dir, stage: DISCUSSION_LIVENESS_REJECTION_STAGE})).map(row => row.nodeId))
            .toEqual(['discussion-dormant']);

        const mixed = await readRouteAttributionLedger({dir, filename: TYPE_GATE_REJECTION_FILENAME});
        expect(summarizeTypeGateRejectionLedger(mixed)).toMatchObject({
            total             : 1,
            byRejectionBucket : {epic: 1},
            byRejectionLabel  : {epic: 1},
            rejectedNodeCounts: {'issue-actionability': 1},
            lastEventAt       : 100
        });
        expect(summarizeTypeGateRejectionLedger(mixed, {stage: DISCUSSION_LIVENESS_REJECTION_STAGE})).toMatchObject({
            total             : 1,
            byRejectionBucket : {'undetermined-no-decaying-support': 1},
            byRejectionLabel  : {},
            rejectedNodeCounts: {'discussion-dormant': 1},
            lastEventAt       : 200
        });
        expect(queryTypeGateRejectionLedger(mixed).map(row => row.nodeId)).toEqual(['issue-actionability']);
        expect(queryTypeGateRejectionLedger(mixed, {stage: DISCUSSION_LIVENESS_REJECTION_STAGE}).map(row => row.nodeId))
            .toEqual(['discussion-dormant']);
        await fs.rm(dir, {recursive: true, force: true})
    });

    test('maxEvents is retained per stage — later liveness pressure cannot evict the actionability view', async () => {
        const dir = await tmpDir();

        await appendTypeGateRejection(record('issue-actionability', ['epic'], 100), {
            dir,
            maxEvents   : 2,
            triggerBytes: 0
        });
        await appendTypeGateRejection(livenessRecord('discussion-liveness-1', ['terminal'], 200), {
            dir,
            maxEvents   : 2,
            triggerBytes: 0
        });
        await appendTypeGateRejection(livenessRecord('discussion-liveness-2', ['terminal'], 300), {
            dir,
            maxEvents   : 2,
            triggerBytes: 0
        });

        expect((await readTypeGateRejectionLedger({dir})).map(row => row.nodeId))
            .toEqual(['issue-actionability']);
        expect((await readTypeGateRejectionLedger({dir, stage: DISCUSSION_LIVENESS_REJECTION_STAGE})).map(row => row.nodeId))
            .toEqual(['discussion-liveness-1', 'discussion-liveness-2']);

        const physicalRows = await readRouteAttributionLedger({dir, filename: TYPE_GATE_REJECTION_FILENAME});
        expect(physicalRows.map(row => row.nodeId))
            .toEqual(['issue-actionability', 'discussion-liveness-1', 'discussion-liveness-2']);

        await fs.rm(dir, {recursive: true, force: true})
    });

    test('summarize folds exclusion labels + rejected-node counts + the newest timestamp', () => {
        const summary = summarizeTypeGateRejectionLedger([
            record('issue-1', ['epic'], 100),
            record('issue-1', ['epic', 'not-code-ready'], 300),
            record('issue-2', ['not-code-ready'], 200)
        ]);

        expect(summary.total).toBe(3);
        expect(summary.byRejectionBucket).toEqual({epic: 2, 'not-code-ready': 2});
        expect(summary.byRejectionLabel).toEqual({epic: 2, 'not-code-ready': 2});
        expect(summary.rejectedNodeCounts).toEqual({'issue-1': 2, 'issue-2': 1});
        expect(summary.lastEventAt).toBe(300);
    });

    test('summarize ignores malformed records + non-array buckets without throwing', () => {
        const summary = summarizeTypeGateRejectionLedger([
            null,
            {nodeId: 'issue-1', rejectionBucket: 'epic', at: 1}, // bucket not an array → contributes no label
            record('issue-2', ['epic'], 2)
        ]);

        expect(summary.total).toBe(1);                              // missing-stage rows never enter a stage view
        expect(summary.byRejectionLabel).toEqual({epic: 1});       // only the well-formed bucket folds
        expect(summary.rejectedNodeCounts).toEqual({'issue-2': 1});
    });

    test('query restricts by time window / exclusion labels / node ids and returns newest-first, capped', () => {
        const records = [
            record('issue-1', ['epic'], 100),
            record('issue-2', ['not-code-ready'], 200),
            record('issue-3', ['epic'], 300)
        ];

        // newest-first, no filter
        expect(queryTypeGateRejectionLedger(records).map(r => r.nodeId)).toEqual(['issue-3', 'issue-2', 'issue-1']);
        // by exclusion label (intersect)
        expect(queryTypeGateRejectionLedger(records, {rejectionLabels: ['epic']}).map(r => r.nodeId)).toEqual(['issue-3', 'issue-1']);
        // by node id
        expect(queryTypeGateRejectionLedger(records, {nodeIds: ['issue-2']}).map(r => r.nodeId)).toEqual(['issue-2']);
        // inclusive time window
        expect(queryTypeGateRejectionLedger(records, {sinceMs: 200, untilMs: 300}).map(r => r.nodeId)).toEqual(['issue-3', 'issue-2']);
        // limit (after newest-first sort)
        expect(queryTypeGateRejectionLedger(records, {limit: 1}).map(r => r.nodeId)).toEqual(['issue-3']);
    });
});
