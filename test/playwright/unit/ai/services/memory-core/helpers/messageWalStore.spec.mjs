import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import fs             from 'fs/promises';
import {mkdtemp, rm}  from 'fs/promises';
import os             from 'os';
import path           from 'path';

import {
    appendMessageWalGraphProjectionMarker,
    appendWalMessage,
    getMessageWalGraphProjectionStats,
    getMessageWalGraphMarkersFileName,
    getMessageWalRecordsFileName,
    getMessageWalSegmentKey,
    readMessageWalProvenanceSegments,
    readPendingMessageWalRecords,
    readWalMessages,
    readWalMessagesByIds
} from '../../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs';

/**
 * @summary Focused accepted-message WAL contract: immutable server plane provenance, honest legacy
 * projection, strict parity evidence, and unchanged graph-drain reconciliation.
 */
test.describe('Neo.ai.services.memory-core.helpers.messageWalStore', () => {
    let tmpDir;

    const DAY      = Date.UTC(2026, 6, 30, 12);
    const PLANE_ID = 'test-message-plane';
    const record   = id => ({
        id,
        timestamp             : DAY,
        graphProjectionVersion: 1,
        message               : {id, type: 'MESSAGE', name: id, properties: {subject: id}},
        routing               : {sentBy: '@alice', to: '@bob', senderUserId: 'alice', broadcastRecipients: []},
        optionalEdges         : {relatedTickets: [], relatedSessions: [], taggedConcepts: []}
    });

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-message-wal-store-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    test('derives UTC segment names for payload and graph receipt files', () => {
        expect(getMessageWalSegmentKey(DAY)).toBe('2026-07-30');
        expect(getMessageWalRecordsFileName('2026-07-30')).toBe('message-wal-2026-07-30.jsonl');
        expect(getMessageWalGraphMarkersFileName('2026-07-30')).toBe('message-wal-2026-07-30.graph.jsonl');
    });

    test('projection markers preserve monotonic route/cohort evidence and surface conflicts (#16767)', async () => {
        const segmentKey = getMessageWalSegmentKey(DAY);

        await appendWalMessage(record('MESSAGE:known-zero'), {dir: tmpDir, planeId: PLANE_ID});
        await appendWalMessage(record('MESSAGE:legacy'), {dir: tmpDir, planeId: PLANE_ID});
        await appendWalMessage(record('MESSAGE:conflict'), {dir: tmpDir, planeId: PLANE_ID});

        await appendMessageWalGraphProjectionMarker({id: 'MESSAGE:known-zero', segmentKey}, {dir: tmpDir});

        let stats = await getMessageWalGraphProjectionStats({dir: tmpDir});
        expect(stats.broadcastCohortById.has('MESSAGE:known-zero')).toBe(false);

        // One later marker enriches the historical projection receipt without changing its
        // unique projected-id count or accepted-WAL segment coordinate.
        await appendMessageWalGraphProjectionMarker({
            id             : 'MESSAGE:known-zero',
            segmentKey,
            mailboxRouting : {disposition: 'known', sentBy: '@alice', to: 'AGENT:*'},
            broadcastCohort: {disposition: 'known', intendedRecipientCount: 0}
        }, {dir: tmpDir});
        await appendMessageWalGraphProjectionMarker({
            id             : 'MESSAGE:legacy',
            segmentKey,
            mailboxRouting : {disposition: 'legacy-unknown'},
            broadcastCohort: {disposition: 'legacy-unknown'}
        }, {dir: tmpDir});
        await appendMessageWalGraphProjectionMarker({
            id             : 'MESSAGE:conflict',
            segmentKey,
            mailboxRouting : {disposition: 'known', sentBy: '@alice', to: 'AGENT:*'},
            broadcastCohort: {disposition: 'known', intendedRecipientCount: 2}
        }, {dir: tmpDir});
        await appendMessageWalGraphProjectionMarker({
            id             : 'MESSAGE:conflict',
            segmentKey,
            mailboxRouting : {disposition: 'legacy-unknown'},
            broadcastCohort: {disposition: 'legacy-unknown'}
        }, {dir: tmpDir});
        await appendMessageWalGraphProjectionMarker({
            id             : 'MESSAGE:conflict',
            segmentKey,
            mailboxRouting : {disposition: 'known', sentBy: '@mallory', to: 'AGENT:*'},
            broadcastCohort: {disposition: 'known', intendedRecipientCount: 0}
        }, {dir: tmpDir});

        stats = await getMessageWalGraphProjectionStats({dir: tmpDir});

        expect(stats.projectedCount).toBe(3);
        expect(stats.segmentById.get('MESSAGE:known-zero')).toBe(segmentKey);
        expect(stats.mailboxRoutingById.get('MESSAGE:known-zero')).toEqual({
            disposition: 'known', sentBy: '@alice', to: 'AGENT:*'
        });
        expect(stats.broadcastCohortById.get('MESSAGE:known-zero')).toEqual({
            disposition           : 'known',
            intendedRecipientCount: 0
        });
        expect(stats.mailboxRoutingById.get('MESSAGE:legacy')).toEqual({disposition: 'legacy-unknown'});
        expect(stats.broadcastCohortById.get('MESSAGE:legacy')).toEqual({disposition: 'legacy-unknown'});
        expect(stats.mailboxRoutingById.get('MESSAGE:conflict')).toEqual({
            disposition: 'known', sentBy: '@alice', to: 'AGENT:*'
        });
        expect(stats.broadcastCohortById.get('MESSAGE:conflict')).toEqual({
            disposition           : 'known',
            intendedRecipientCount: 2
        });
        expect([...stats.markerConflicts.mailboxRoutingIds]).toEqual(['MESSAGE:conflict']);
        expect([...stats.markerConflicts.broadcastCohortIds]).toEqual(['MESSAGE:conflict']);
    });

    test('a surviving marker keeps a missing payload segment in the projected candidate population (#16767)', async () => {
        const durable   = await appendWalMessage(record('MESSAGE:missing-payload'), {dir: tmpDir, planeId: PLANE_ID}),
            payloadPath = path.join(tmpDir, getMessageWalRecordsFileName(durable.segmentKey));

        await appendMessageWalGraphProjectionMarker({
            id            : 'MESSAGE:missing-payload',
            segmentKey    : durable.segmentKey,
            mailboxRouting: {disposition: 'known', sentBy: '@alice', to: '@bob'}
        }, {dir: tmpDir});

        expect((await getMessageWalGraphProjectionStats({dir: tmpDir})).projectedCount).toBe(1);

        await fs.rm(payloadPath);

        const stats = await getMessageWalGraphProjectionStats({dir: tmpDir});
        expect(stats.projectedCount).toBe(1);
        expect(stats.projectedIds.has('MESSAGE:missing-payload')).toBe(true);
        expect(stats.segmentById.get('MESSAGE:missing-payload')).toBe(durable.segmentKey);
        expect(stats.payloadSignatureBySegment.get(durable.segmentKey)).toBe('unavailable:ENOENT');
        expect(await readWalMessagesByIds({dir: tmpDir, ids: ['MESSAGE:missing-payload']})).toEqual([]);
    });

    test('server plane provenance overrides a caller spoof and survives every read path', async () => {
        const {filePath, segmentKey} = await appendWalMessage(
            {...record('MESSAGE:stamped'), planeId: 'caller-spoof'},
            {dir: tmpDir, planeId: PLANE_ID}
        );
        const durable = JSON.parse((await fs.readFile(filePath, 'utf8')).trim()),
              serving = await readWalMessages({dir: tmpDir}),
              pending = await readPendingMessageWalRecords({dir: tmpDir}),
              strict  = await readMessageWalProvenanceSegments({dir: tmpDir});

        expect(segmentKey).toBe('2026-07-30');
        expect(durable.planeId).toBe(PLANE_ID);
        expect(serving[0].planeId).toBe(PLANE_ID);
        expect(pending[0].planeId).toBe(PLANE_ID);
        expect(strict.ok).toBe(true);
        expect(strict.segments[0].records[0].planeId).toBe(PLANE_ID);

        await appendMessageWalGraphProjectionMarker(
            {id: durable.id, segmentKey},
            {dir: tmpDir}
        );
        expect((await readWalMessagesByIds({dir: tmpDir, ids: [durable.id]}))[0].planeId).toBe(PLANE_ID);
    });

    test('missing, reserved, or path-shaped resolved plane identities reject before append', async () => {
        await expect(appendWalMessage(record('MESSAGE:missing'), {dir: tmpDir}))
            .rejects.toThrow('planeId must be an opaque resolved plane identity');
        await expect(appendWalMessage(record('MESSAGE:unknown'), {dir: tmpDir, planeId: 'unknown'}))
            .rejects.toThrow('planeId must be an opaque resolved plane identity');
        await expect(appendWalMessage(record('MESSAGE:path'), {dir: tmpDir, planeId: '../overlay'}))
            .rejects.toThrow('planeId must be an opaque resolved plane identity');
        expect(await fs.readdir(tmpDir)).toEqual([]);
    });

    test('legacy rows remain readable and drainable as unknown without rewriting durable history', async () => {
        const segmentKey = getMessageWalSegmentKey(DAY),
              filePath   = path.join(tmpDir, getMessageWalRecordsFileName(segmentKey)),
              legacy     = {...record('MESSAGE:legacy'), segmentKey};

        await fs.writeFile(filePath, `${JSON.stringify(legacy)}\n`, 'utf8');

        const serving = await readWalMessages({dir: tmpDir}),
              pending = await readPendingMessageWalRecords({dir: tmpDir}),
              durable = JSON.parse((await fs.readFile(filePath, 'utf8')).trim());

        expect(serving[0].planeId).toBe('unknown');
        expect(pending[0].planeId).toBe('unknown');
        expect(durable).not.toHaveProperty('planeId');

        await appendMessageWalGraphProjectionMarker(
            {id: legacy.id, segmentKey},
            {dir: tmpDir}
        );
        expect(await readPendingMessageWalRecords({dir: tmpDir})).toEqual([]);
    });

    test('strict evidence refuses a torn row while operational serving keeps valid records available', async () => {
        const {filePath} = await appendWalMessage(record('MESSAGE:valid'), {
            dir    : tmpDir,
            planeId: PLANE_ID
        });

        await fs.appendFile(filePath, '{"id":"MESSAGE:torn"', 'utf8');

        expect((await readWalMessages({dir: tmpDir})).map(item => item.id)).toEqual(['MESSAGE:valid']);

        const strict = await readMessageWalProvenanceSegments({dir: tmpDir});

        expect(strict.ok).toBe(false);
        expect(strict.reason).toContain('line 2 is not valid JSON');
    });
});
