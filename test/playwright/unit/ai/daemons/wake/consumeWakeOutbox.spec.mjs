import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {consumeWakeOutbox} from '../../../../../../ai/daemons/wake/consumeWakeOutbox.mjs';
import {withAppendLock}    from '../../../../../../ai/services/memory-core/helpers/walAppendLock.mjs';

/**
 * @summary Pins the kimi-pull-bridge seat-side consume contract: digest surfacing, ack-ledger
 * idempotency, torn-line tolerance, and append-survives-consume under the shared lock.
 */
test.describe('ai/daemons/wake/consumeWakeOutbox (#15665)', () => {
    const roots = [];

    function createRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-wake-consume-'));
        roots.push(root);
        return root
    }

    function writeOutbox(outboxPath, entries) {
        fs.writeFileSync(outboxPath, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n', {mode: 0o600})
    }

    test.afterAll(() => {
        roots.forEach(root => fs.rmSync(root, {force: true, recursive: true}))
    });

    test('consume prints digests, writes ack receipts, and idempotently skips re-appends', async () => {
        const root       = createRoot(),
              outboxPath = path.join(root, 'wake-outbox.jsonl'),
              logger     = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [
            {wakeId: 'aaa111', subscriptionId: 'sub_1', agentIdentity: '@agent', sessionId: 'ses_1', processEpoch: 4242, digest: 'first wake'},
            {wakeId: 'bbb222', subscriptionId: 'sub_1', agentIdentity: '@agent', sessionId: 'ses_1', processEpoch: 4242, digest: 'second wake'}
        ]);

        const first = await consumeWakeOutbox({outboxPath, logger});

        expect(first.consumed).toBe(2);
        expect(first.remaining).toBe(0);
        expect(logger.lines.join('\n')).toContain('first wake');
        expect(logger.lines.join('\n')).toContain('second wake');
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('');

        const ackLines = fs.readFileSync(`${outboxPath}.acks.jsonl`, 'utf8').trim().split('\n');
        expect(ackLines.length).toBe(2);
        expect(JSON.parse(ackLines[0]).wakeId).toBe('aaa111');

        // A retry of the same logical wake (same wakeId) is a duplicate, not a re-delivery.
        writeOutbox(outboxPath, [{wakeId: 'aaa111', digest: 'first wake'}]);

        const second = await consumeWakeOutbox({outboxPath, logger});

        expect(second.consumed).toBe(0);
        expect(second.duplicates).toBe(1);
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('');
        expect(logger.lines.filter(line => line === '[wake-outbox] first wake').length).toBe(1)
    });

    test('a torn final line is preserved for the next consume', async () => {
        const root       = createRoot(),
              outboxPath = path.join(root, 'wake-outbox.jsonl'),
              logger     = {lines: [], log(line) { this.lines.push(line) }};

        fs.writeFileSync(
            outboxPath,
            `${JSON.stringify({wakeId: 'ccc333', digest: 'whole wake'})}\n{"wakeId":"ddd444","dig`,
            {mode: 0o600}
        );

        const result = await consumeWakeOutbox({outboxPath, logger});

        expect(result.consumed).toBe(1);
        expect(result.keptCorrupt).toBe(1);
        expect(result.remaining).toBe(1);
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('{"wakeId":"ddd444","dig\n')
    });

    test('an append landing mid-consume survives compaction under the shared lock', async () => {
        const root       = createRoot(),
              outboxPath = path.join(root, 'wake-outbox.jsonl'),
              logger     = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [{wakeId: 'eee555', digest: 'old wake'}]);

        // Hold the lock (the consume's critical section). The producer starts inside the hold
        // and spins on the lock; we compact the consumed entry away and release — the producer's
        // append then lands AFTER the compaction and must survive it.
        let producerPromise;

        await withAppendLock(outboxPath, async () => {
            producerPromise = withAppendLock(outboxPath, () =>
                fs.promises.appendFile(outboxPath, JSON.stringify({wakeId: 'fff666', digest: 'fresh wake'}) + '\n', {mode: 0o600})
            );

            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.promises.writeFile(outboxPath, '', {mode: 0o600});
        });

        await producerPromise;

        // The consume pass itself, post-race: the fresh entry is delivered, not erased.
        const result = await consumeWakeOutbox({outboxPath, logger});

        expect(result.consumed).toBe(1);
        expect(logger.lines.join('\n')).toContain('fresh wake')
    });

    test('consume of an absent outbox is a soft no-op', async () => {
        const root   = createRoot(),
              logger = {lines: [], log(line) { this.lines.push(line) }};

        const result = await consumeWakeOutbox({outboxPath: path.join(root, 'absent.jsonl'), logger});

        expect(result.consumed).toBe(0);
        expect(result.remaining).toBe(0)
    })
});
