import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import os             from 'os';
import path           from 'path';

import {withOutboxLock} from '../../../../../../ai/daemons/wake/outboxLock.mjs';

/**
 * @summary Pins the strict outbox lock: a live holder is never reclaimed (no TTL), acquisition
 * timeout throws instead of writing unlocked, and only a dead-pid holder is reclaimed.
 */
test.describe('ai/daemons/wake/outboxLock (#15665)', () => {
    const roots = [];

    function createRoot() {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-outbox-lock-'));
        roots.push(root);
        return root
    }

    test.afterAll(() => {
        roots.forEach(root => fs.rmSync(root, {force: true, recursive: true}))
    });

    test('a live holder is never reclaimed, even past the borrowed WAL helper TTL', async () => {
        const root     = createRoot(),
              filePath = path.join(root, 'outbox.jsonl'),
              lockPath = `${filePath}.lock`;

        // A live pid (this spec process) holds the lock "stale" beyond any TTL-style threshold.
        fs.writeFileSync(lockPath, JSON.stringify({pid: process.pid, startedAt: Date.now() - 60000}));

        // A second acquirer with a short timeout must THROW — never reclaim a live holder and
        // never write unlocked — and the guarded file stays untouched.
        await expect(withOutboxLock(filePath, () => fs.promises.writeFile(filePath, 'unlocked-write'), {acquireTimeoutMs: 250, retryIntervalMs: 25}))
            .rejects.toThrow('refusing to write unlocked');

        expect(fs.existsSync(filePath)).toBe(false);
        expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid).toBe(process.pid);
    });

    test('a dead-pid holder is reclaimed via the byte-match fence', async () => {
        const root     = createRoot(),
              filePath = path.join(root, 'outbox.jsonl');

        const {spawnSync} = await import('node:child_process'),
              deadPid     = spawnSync(process.execPath, ['-e', '']).pid;

        fs.writeFileSync(`${filePath}.lock`, JSON.stringify({pid: deadPid, startedAt: Date.now()}));

        const result = await withOutboxLock(filePath, () => fs.promises.writeFile(filePath, 'line\n').then(() => 'wrote'));

        expect(result).toBe('wrote');
        expect(fs.readFileSync(filePath, 'utf8')).toBe('line\n');
        expect(fs.existsSync(`${filePath}.lock`)).toBe(false);
    });

    test('fn result passes through and the lock releases only while the descriptor names our pid', async () => {
        const root     = createRoot(),
              filePath = path.join(root, 'outbox.jsonl');

        const result = await withOutboxLock(filePath, async () => {
            expect(fs.existsSync(`${filePath}.lock`)).toBe(true);
            return 42
        });

        expect(result).toBe(42);
        expect(fs.existsSync(`${filePath}.lock`)).toBe(false);
    });

    test('a corrupt lock descriptor fails closed via timeout and is never auto-deleted', async () => {
        const root     = createRoot(),
              filePath = path.join(root, 'outbox.jsonl'),
              lockPath = `${filePath}.lock`;

        fs.writeFileSync(lockPath, '{"pid":"NaN", garbage');

        await expect(withOutboxLock(filePath, () => fs.promises.writeFile(filePath, 'x'), {acquireTimeoutMs: 250, retryIntervalMs: 25}))
            .rejects.toThrow('refusing to write unlocked');

        // Corrupt content could be a torn write by a live holder — it is preserved for
        // manual/holder recovery, never auto-deleted.
        expect(fs.readFileSync(lockPath, 'utf8')).toBe('{"pid":"NaN", garbage');
    });

    test('concurrent critical sections serialize — a second writer waits and then lands', async () => {
        const root     = createRoot(),
              filePath = path.join(root, 'outbox.jsonl');

        let secondStarted = false;

        const first = withOutboxLock(filePath, async () => {
            await new Promise(resolve => setTimeout(resolve, 300));
            await fs.promises.writeFile(filePath, 'first\n')
        });

        const second = (async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            secondStarted = true;
            await withOutboxLock(filePath, () => fs.promises.appendFile(filePath, 'second\n'))
        })();

        await Promise.all([first, second]);

        expect(fs.readFileSync(filePath, 'utf8')).toBe('first\nsecond\n');
        expect(secondStarted).toBe(true)
    })
});
