import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import {mkdtemp, rm}  from 'fs/promises';
import os             from 'os';
import path           from 'path';

import {appendWalMessage} from '../../../../../../ai/services/memory-core/helpers/messageWalStore.mjs';
import {
    createMessageGraphProjectionProcessor,
    drainMessageWalOnce,
    getMessageDrainBackoffDelayMs,
    processMessageBatch
} from '../../../../../../ai/daemons/message/drainCycle.mjs';

/**
 * Message WAL drain topology — host-agnostic cycle coverage. The replay processor is deliberately
 * injected because idempotent mailbox graph projection is a separate concern.
 */
test.describe('Neo.ai.daemons.message.drainCycle', () => {
    let tmpDir;

    test.beforeEach(async () => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'neo-message-drain-'));
    });

    test.afterEach(async () => {
        await rm(tmpDir, {recursive: true, force: true});
    });

    const record = id => ({
        id,
        timestamp             : Date.now(),
        graphProjectionVersion: 1,
        message               : {
            id,
            type      : 'MESSAGE',
            name      : `subject ${id}`,
            properties: {subject: `subject ${id}`}
        },
        routing      : {sentBy: '@alice', to: '@bob', senderUserId: 'alice', broadcastRecipients: []},
        optionalEdges: {relatedTickets: [], relatedSessions: [], taggedConcepts: []}
    });

    const seed = id => appendWalMessage(record(id), {dir: tmpDir});

    test('without a replay processor, the cycle skips WAL reads instead of doing active no-op work', async () => {
        await seed('MESSAGE:deferred');

        let   readCalled = false;
        const summary    = await drainMessageWalOnce({
            dir          : tmpDir,
            batchSize    : 20,
            maxRetries   : 1,
            backoffBaseMs: 1000,
            readMessages : async () => {
                readCalled = true;
                throw new Error('readMessages should not be called without a processor');
            }
        });

        expect(summary).toEqual({observed: 0, drained: 0, failed: 0, deferred: 0, inactive: true});
        expect(readCalled).toBe(false);
    });

    test('batchSize bounds the records passed to the replay processor', async () => {
        await seed('MESSAGE:a');
        await seed('MESSAGE:b');
        await seed('MESSAGE:c');

        const seen    = [];
        const summary = await drainMessageWalOnce({
            dir          : tmpDir,
            batchSize    : 2,
            maxRetries   : 1,
            backoffBaseMs: 1000,
            processRecords(records) {
                seen.push(...records.map(item => item.id));
                return {drained: records.length, failed: 0, deferred: 0};
            }
        });

        expect(summary).toEqual({observed: 3, inactive: false, drained: 2, failed: 0, deferred: 0});
        expect(seen).toHaveLength(2);
    });

    test('processor failures retry with exponential backoff, then succeed', async () => {
        const records  = [record('MESSAGE:retry')];
        const sleeps   = [];
        let   attempts = 0;

        const summary = await processMessageBatch({
            records,
            maxRetries   : 2,
            backoffBaseMs: 1000,
            sleep        : async ms => sleeps.push(ms),
            processRecords() {
                attempts++;
                if (attempts < 3) throw new Error('graph temporarily down');
                return {drained: 1, failed: 0, deferred: 0};
            }
        });

        expect(summary).toEqual({drained: 1, failed: 0, deferred: 0});
        expect(attempts).toBe(3);
        expect(sleeps).toEqual([
            getMessageDrainBackoffDelayMs(1000, 0),
            getMessageDrainBackoffDelayMs(1000, 1)
        ]);
    });

    test('exhausted processor failures leave the whole batch failed and retryable', async () => {
        const records = [record('MESSAGE:failed')];

        const summary = await processMessageBatch({
            records,
            maxRetries   : 1,
            backoffBaseMs: 1000,
            sleep        : async () => {},
            processRecords() {
                throw new Error('still down');
            }
        });

        expect(summary).toEqual({drained: 0, failed: 1, deferred: 0});
    });

    test('projection processor adapts mailbox drain summaries to cycle counters', async () => {
        const processRecords = createMessageGraphProjectionProcessor({
            async drainPendingMessageGraphProjections({ids, limit}) {
                expect(ids).toEqual(['MESSAGE:a', 'MESSAGE:b']);
                expect(limit).toBe(2);

                return {pending: 2, projected: 1, failed: 1};
            }
        });

        const summary = await processRecords([record('MESSAGE:a'), record('MESSAGE:b')]);

        expect(summary).toEqual({drained: 1, failed: 1, deferred: 0});
    });
});
