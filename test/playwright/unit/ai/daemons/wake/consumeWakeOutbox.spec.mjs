import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {consumeWakeOutbox} from '../../../../../../ai/daemons/wake/consumeWakeOutbox.mjs';
import {withOutboxLock}    from '../../../../../../ai/daemons/wake/outboxLock.mjs';

/**
 * @summary Pins the kimi-pull-bridge seat-side consume contract: three-leg owner validation
 * (identity, session, reuse-safe epoch), descent authority, correlated acks, idempotency,
 * torn-line tolerance, and append-survives-consume under the strict lock.
 */
test.describe('ai/daemons/wake/consumeWakeOutbox (#15665)', () => {
    const roots = [];

    const OWNER_IDENTITY = '@agent-test',
          OWNER_START    = 'START-TIME';

    function createRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-wake-consume-'));
        roots.push(root);
        return root
    }

    function writeEnvelope(root) {
        const envelopePath = path.join(root, 'wake-envelope.json');
        fs.writeJsonSync(envelopePath, {
            sessionId    : 'ses_test',
            cwd          : '/seat/checkout',
            pid          : process.pid,
            pidStartedAt : OWNER_START,
            agentIdentity: OWNER_IDENTITY,
            updatedAt    : '2026-07-22T16:00:00.000Z'
        });
        return envelopePath
    }

    /** Spec seams: the owner reads as alive, every lstart lookup matches, and any pid chain lands on the owner. */
    const liveSeams = {
        isAlive : pid => pid === process.pid,
        lstartOf: () => OWNER_START,
        ppidOf  : () => process.pid
    };

    function writeOutbox(outboxPath, entries) {
        fs.writeFileSync(outboxPath, entries.map(entry => JSON.stringify(entry)).join('\n') + '\n', {mode: 0o600})
    }

    function validEntry(wakeId, digest) {
        return {
            wakeId,
            subscriptionId: 'sub_1',
            agentIdentity : OWNER_IDENTITY,
            sessionId     : 'ses_test',
            processEpoch  : process.pid,
            pidStartedAt  : OWNER_START,
            digest
        }
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

        const first = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

        expect(first.consumed).toBe(2);
        expect(first.remaining).toBe(0);
        expect(logger.lines.join('\n')).toContain('first wake');
        expect(logger.lines.join('\n')).toContain('second wake');
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('');

        const ackLines = fs.readFileSync(`${outboxPath}.acks.jsonl`, 'utf8').trim().split('\n');
        expect(ackLines.length).toBe(2);
        expect(JSON.parse(ackLines[0])).toMatchObject({wakeId: 'aaa111', sessionId: 'ses_test', processEpoch: process.pid});
        expect(JSON.parse(ackLines[0])).not.toHaveProperty('pid');

        writeOutbox(outboxPath, [validEntry('aaa111', 'first wake')]);

        const second = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

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

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

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

        let producerPromise;

        await withOutboxLock(outboxPath, async () => {
            producerPromise = withOutboxLock(outboxPath, () =>
                fs.promises.appendFile(outboxPath, JSON.stringify(validEntry('fff666', 'fresh wake')) + '\n', {mode: 0o600})
            );

            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.promises.writeFile(outboxPath, '', {mode: 0o600});
        });

        await producerPromise;

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

        expect(result.consumed).toBe(1);
        expect(logger.lines.join('\n')).toContain('fresh wake')
    });

    test('a live consumer is never reclaimed — the strict lock outlasts the borrowed WAL TTL', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [validEntry('ggg777', 'slow-consume wake')]);

        let producerPromise;

        await withOutboxLock(outboxPath, async () => {
            producerPromise = withOutboxLock(outboxPath, () =>
                fs.promises.appendFile(outboxPath, JSON.stringify(validEntry('hhh888', 'post-hold wake')) + '\n', {mode: 0o600})
            );

            // wall-clock-under-test: the assertion IS that a second writer stays blocked while the
            // lock is held, so elapsed time is the observable rather than an inconvenience.
            // out-waits: the outbox lock-hold threshold in withOutboxLock.
            await new Promise(resolve => setTimeout(resolve, 2600));

            const heldLines = fs.readFileSync(outboxPath, 'utf8').trim().split('\n').filter(Boolean);
            expect(heldLines.length).toBe(1); // no producer write during the entire long hold

            await fs.promises.writeFile(outboxPath, '', {mode: 0o600});
        });

        await producerPromise;

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

        expect(result.consumed).toBe(1);
        expect(logger.lines.join('\n')).toContain('post-hold wake')
    });

    test('a foreign agent identity is dead-lettered — never printed, never acked', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [
            {...validEntry('iii999', 'stranger wake'), agentIdentity: '@different-seat'},
            validEntry('jjj000', 'owner wake')
        ]);

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

        expect(result.consumed).toBe(1);
        expect(result.deadLetters).toBe(1);
        expect(logger.lines.join('\n')).not.toContain('stranger wake');
        expect(logger.lines.join('\n')).toContain('owner wake');

        const dead = fs.readFileSync(`${outboxPath}.dead.jsonl`, 'utf8').trim().split('\n');
        expect(dead.length).toBe(1);
        expect(JSON.parse(dead[0]).reason).toBe('identity-mismatch');
        expect(fs.readFileSync(outboxPath, 'utf8')).toBe('')
    });

    test('a session-mismatched entry is dead-lettered', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [
            {...validEntry('kkk111', 'stranger session wake'), sessionId: 'ses_stranger'},
            validEntry('lll222', 'owner wake')
        ]);

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

        expect(result.consumed).toBe(1);
        expect(result.deadLetters).toBe(1);
        expect(logger.lines.join('\n')).not.toContain('stranger session wake');

        const dead = fs.readFileSync(`${outboxPath}.dead.jsonl`, 'utf8').trim().split('\n');
        expect(JSON.parse(dead[0]).reason).toBe('session-mismatch');
    });

    test('a pid-reused epoch (same number, different start time) is dead-lettered', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        writeOutbox(outboxPath, [
            {...validEntry('mmm333', 'reused-pid wake'), pidStartedAt: 'DIFFERENT-START'},
            validEntry('nnn444', 'owner wake')
        ]);

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

        expect(result.consumed).toBe(1);
        expect(result.deadLetters).toBe(1);
        expect(logger.lines.join('\n')).not.toContain('reused-pid wake');

        const dead = fs.readFileSync(`${outboxPath}.dead.jsonl`, 'utf8').trim().split('\n');
        expect(JSON.parse(dead[0]).reason).toBe('stale-epoch');
    });

    test('a dead-pid epoch is dead-lettered', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl'),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        const {spawnSync} = await import('node:child_process'),
              gone        = spawnSync(process.execPath, ['-e', '']).pid;

        writeOutbox(outboxPath, [
            {...validEntry('ooo555', 'dead-pid wake'), processEpoch: gone},
            validEntry('ppp666', 'owner wake')
        ]);

        const result = await consumeWakeOutbox({outboxPath, envelopePath, logger, ...liveSeams});

        expect(result.consumed).toBe(1);
        expect(result.deadLetters).toBe(1);
        expect(logger.lines.join('\n')).not.toContain('dead-pid wake');

        const dead = fs.readFileSync(`${outboxPath}.dead.jsonl`, 'utf8').trim().split('\n');
        expect(JSON.parse(dead[0]).reason).toBe('stale-epoch');
    });

    test('a stale envelope owner refuses visibly instead of consuming for a rotated seat', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl');

        const {spawnSync} = await import('node:child_process'),
              gone        = spawnSync(process.execPath, ['-e', '']).pid;

        fs.writeJsonSync(envelopePath, {sessionId: 'ses_test', cwd: '/seat/checkout', pid: gone, pidStartedAt: OWNER_START, agentIdentity: OWNER_IDENTITY, updatedAt: '2026-07-22T16:00:00.000Z'});
        writeOutbox(outboxPath, [validEntry('qqq777', 'any wake')]);

        await expect(consumeWakeOutbox({outboxPath, envelopePath, ...liveSeams})).rejects.toThrow('dead owner process');
    });

    test('a pid-reused envelope owner refuses visibly instead of consuming', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl');

        fs.writeJsonSync(envelopePath, {sessionId: 'ses_test', cwd: '/seat/checkout', pid: process.pid, pidStartedAt: 'DIFFERENT-START', agentIdentity: OWNER_IDENTITY, updatedAt: '2026-07-22T16:00:00.000Z'});
        writeOutbox(outboxPath, [validEntry('rrr888', 'any wake')]);

        await expect(consumeWakeOutbox({outboxPath, envelopePath, ...liveSeams})).rejects.toThrow('epoch mismatch');
    });

    test('a foreign caller (no descent from the owner pid) refuses visibly', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              outboxPath   = path.join(root, 'wake-outbox.jsonl');

        writeOutbox(outboxPath, [validEntry('sss999', 'any wake')]);

        await expect(consumeWakeOutbox({
            outboxPath,
            envelopePath,
            pid    : 999999,
            isAlive: () => true,
            lstartOf,
            ppidOf : () => 1 // chain never reaches the owner pid
        })).rejects.toThrow('not inside the owner process tree');

        function lstartOf() { return OWNER_START }
    });

    test('consume of an absent outbox is a soft no-op', async () => {
        const root         = createRoot(),
              envelopePath = writeEnvelope(root),
              logger       = {lines: [], log(line) { this.lines.push(line) }};

        const result = await consumeWakeOutbox({outboxPath: path.join(root, 'absent.jsonl'), envelopePath, logger, ...liveSeams});

        expect(result.consumed).toBe(0);
        expect(result.remaining).toBe(0)
    })
});
