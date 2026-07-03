import {test, expect}                  from '@playwright/test';
import Neo                             from '../../../../../../src/Neo.mjs';
import * as core                       from '../../../../../../src/core/_export.mjs';
import {mkdtemp, rm, readFile, access} from 'fs/promises';
import os                              from 'os';
import path                            from 'path';

import {
    acquireMessageDrainLock,
    DrainLockHeldError,
    DRAIN_LOCK_FILENAME
} from '../../../../../../ai/daemons/message/drainLock.mjs';

/**
 * Message drain-lock wrapper — proves the message WAL topology reuses the mechanical sole-drainer
 * lock while emitting message-domain remediation text.
 */
test.describe('Neo.ai.daemons.message.drainLock', () => {
    let dir;

    test.beforeEach(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'neo-message-drain-lock-'));
    });

    test.afterEach(async () => {
        await rm(dir, {recursive: true, force: true});
    });

    const lockPath  = () => path.join(dir, DRAIN_LOCK_FILENAME);
    const alive     = () => true;
    const dead      = () => false;
    const holderNow = async () => JSON.parse(await readFile(lockPath(), 'utf8'));

    test('claims and releases the message WAL drain lock', async () => {
        const handle = acquireMessageDrainLock({dir, owner: 'daemon', pid: 4242, isAlive: dead});

        expect(handle.owner).toBe('daemon');
        expect((await holderNow()).pid).toBe(4242);

        handle.release();
        await expect(access(lockPath())).rejects.toThrow();
    });

    test('second live message drain host refuses with message-specific remediation', async () => {
        acquireMessageDrainLock({dir, owner: 'daemon', pid: 4242, isAlive: alive});

        let thrown;
        try {
            acquireMessageDrainLock({dir, owner: 'in-process', pid: 7777, isAlive: alive});
        } catch (err) {
            thrown = err;
        }

        expect(thrown).toBeInstanceOf(DrainLockHeldError);
        expect(thrown.code).toBe('DRAIN_LOCK_HELD');
        expect(thrown.message).toContain('Message WAL drain lock');
        expect(thrown.message).toContain('daemon pid 4242');
        expect(thrown.message).toContain('in-process pid 7777');
        expect(thrown.message).toContain('message daemon OR messageWal.inProcessDrain');
        expect((await holderNow()).pid).toBe(4242);
    });
});
