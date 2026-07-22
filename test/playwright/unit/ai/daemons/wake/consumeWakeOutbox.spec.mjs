import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {consumeWakeOutbox} from '../../../../../../ai/daemons/wake/consumeWakeOutbox.mjs';
import {withOutboxLock}    from '../../../../../../ai/daemons/wake/outboxLock.mjs';

/**
 * @summary Pins the kimi-pull-bridge seat-side consume contract: digest surfacing, ack-ledger
 * idempotency, torn-line tolerance, append-survives-consume under the strict lock, and
 * exact-owner validation with dead-letter rejection.
 */
test.describe('ai/daemons/wake/consumeWakeOutbox (#15665)', () => {
    const roots = [];

    function createRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-wake-consume-'));
        roots.push(root);
        return root
    }

    function writeEnvelope(root) {
        const envelopePath = path.join(root, 'wake-envelope.json');
        fs.writeJsonSync(envelopePath, {sessionId: 'ses_test', cwd: '/seat/checkout', pid: process.pid, updatedAt: '2026-07-22T16:00:00.000Z'});
        return envelopePath
    }

    function writeOutbox(outboxPath, entries) {
        fs.writeFileSync(outboxPath, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n', {mode: 0o600})
    }

    function validEntry(wakeId, digest) {
        return {wakeId, subscriptionId: 'sub_1', agentIdentity: '@agent', sessionId: 'ses_test', processEpoch: process.pid, digest}
    }

    test.afterAll(() => {
        roots.forEach(root => fs.rmSync(root, {force: true, recursive: true}))
    });

    test('consume prints digests, writes correlated ack receipts, and idempotently skips re-appends', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [
            validEntry('aaa111', 'first wake'),
            validEntry('bbb222', 'second wake')
        ]);

        const first = await consumeWakeOutbox({outboxPath, envelopePath, logger});

        expect(first.consumed).toBe(2);
        expect(first.remaining).toBe(0);
        expect(logger.lines.join('\n')).toContain('first wake');
        expect(logger.lines.join('\n')).toContain('second wake');
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('');

        const ackLines = fs.readFileSync(`${outboxPath}.acks.jsonl`, 'utf8').trim().split('\n');
        expect(ackLines.length).toBe(2);
        expect(JSON.parse(ackLines[0]).wakeId).toBe('aaa111');
        expect(JSON.parse(ackLines[0]).sessionId).toBe('ses_test');
        expect(JSON.parse(ackLines[0]).processEpoch).toBe(process.pid);

        // A retry of the same logical wake (same wakeId) is a duplicate, not a re-delivery.
        writeOutbox(outboxPath, [validEntry('aaa111', 'first wake')]);

        const second = await consumeWakeOutbox({outboxPath, envelopePath, logger});

        expect(second.consumed).toBe(0);
        expect(second.duplicates).toBe(1);
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('');
        expect(logger.lines.filter(line => line === '[wake-outbox] first wake').length).toBe(1)
    });

    test('a torn final line is preserved for the next consume', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        fs.writeFileSync(
            outboxPath,
            `${JSON.stringify(validEntry('ccc333', 'whole wake'))}\n{"wakeId":"ddd444","dig`,
            {mode: 0o600}
        );

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger});

        expect(result.consumed).toBe(1);
        expect(result.keptCorrupt).toBe(1);
        expect(result.remaining).toBe(1);
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('{"wakeId":"ddd444","dig\n')
    });

    test('an append landing mid-consume survives compaction under the strict lock', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [validEntry('eee555', 'old wake')]);

        // Hold the lock (the consume's critical section). The producer starts inside the hold
        // and spins on the lock; we compact the consumed entry away and release — the producer's
        // append then lands AFTER the compaction and must survive it.
        let producerPromise;

        await withOutboxLock(outboxPath, async () => {
            producerPromise = withOutboxLock(outboxPath, () =>
                fs.promises.appendFile(outboxPath, JSON.stringify(validEntry('fff666', 'fresh wake')) + '\n', {mode: 0o600})
            );

            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.promises.writeFile(outboxPath, '', {mode: 0o600});
        });

        await producerPromise;

        // The consume pass itself, post-race: the fresh entry is delivered, not erased.
        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger});

        expect(result.consumed).toBe(1);
        expect(logger.lines.join('\n')).toContain('fresh wake')
    });

    test('a live consumer is never reclaimed — the strict lock outlasts the borrowed WAL TTL', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [validEntry('ggg777', 'slow-consume wake')]);

        // Hold past the borrowed WAL helper's 2s TTL (2.6s — the review's exact probe): a live
        // holder must never be reclaimed, and the producer lands only after release.
        let producerPromise;

        await withOutboxLock(outboxPath, async () => {
            producerPromise = withOutboxLock(outboxPath, () =>
                fs.promises.appendFile(outboxPath, JSON.stringify(validEntry('hhh888', 'post-hold wake')) + '\n', {mode: 0o600})
            );

            await new Promise(resolve => setTimeout(resolve, 2600));

            const heldLines = fs.readFileSync(outboxPath, 'utf8').trim().split('\n').filter(Boolean);
            expect(heldLines.length).toBe(1); // no producer write during the entire long hold

            await fs.promises.writeFile(outboxPath, '', {mode: 0o600});
        });

        await producerPromise;

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger});

        expect(result.consumed).toBe(1);
        expect(logger.lines.join('\n')).toContain('post-hold wake')
    });

    test('a session-mismatched entry is dead-lettered — never printed, never acked', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [
            {...validEntry('iii999', 'stranger wake'), sessionId: 'ses_stranger'},
            validEntry('jjj000', 'owner wake')
        ]);

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger});

        expect(result.consumed).toBe(1);
        expect(result.deadLetters).toBe(1);
        expect(logger.lines.join('\n')).not.toContain('stranger wake');
        expect(logger.lines.join('\n')).toContain('owner wake');

        const dead = fs.readFileSync(`${outboxPath}.dead.jsonl`, 'utf8').trim().split('\n');
        expect(dead.length).toBe(1);
        expect(JSON.parse(dead[0]).reason).toBe('session-mismatch');
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('')
    });

    test('a stale-epoch entry is dead-lettered — never printed, never acked', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        const {spawnSync} = await import('node:child_process'),
              deadPid     = spawnSync(process.execPath, ['-e', '']).pid;

        writeOutbox(outboxPath, [
            {...validEntry('kkk111', 'rotated-owner wake'), processEpoch: deadPid},
            validEntry('lll222', 'owner wake')
        ]);

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger});

        expect(result.consumed).toBe(1);
        expect(result.deadLetters).toBe(1);
        expect(logger.lines.join('\n')).not.toContain('rotated-owner wake');

        const dead = fs.readFileSync(`${outboxPath}.dead.jsonl`, 'utf8').trim().split('\n');
        expect(dead.length).toBe(1);
        expect(JSON.parse(dead[0]).reason).toBe('stale-epoch');
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('')
    });

    test('a stale envelope owner refuses visibly instead of consuming for a rotated seat', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl');

        const {spawnSync} = await import('node:child_process'),
              deadPid     = spawnSync(process.execPath, ['-e', '']).pid;

        fs.writeJsonSync(envelopePath, {sessionId: 'ses_test', cwd: '/seat/checkout', pid: deadPid, updatedAt: '2026-07-22T16:00:00.000Z'});
        writeOutbox(outboxPath, [validEntry('mmm333', 'any wake')]);

        await expect(consumeWakeOutbox({outboxPath, envelopePath})).rejects.toThrow('dead owner process');
    });

    test('consume of an absent outbox is a soft no-op', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        const result = await consumeWakeOutbox({outboxPath: path.join(root, 'absent.jsonl'), envelopePath, logger});

        expect(result.consumed).toBe(0);
        expect(result.remaining).toBe(0)
    })
});
