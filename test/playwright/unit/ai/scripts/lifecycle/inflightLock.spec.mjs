import {setup} from '../../../../setup.mjs';

const appName = 'InflightLockTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}            from '@playwright/test';
import fs                        from 'fs/promises';
import {existsSync}              from 'fs';
import path                      from 'path';
import {randomUUID}              from 'crypto';
import os                        from 'os';
import Neo                       from '../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../src/core/_export.mjs';

test.describe('ai/scripts/inflightLock', () => {
    // Shared identity-derived lock and gate paths; focused runs must not race the file state.
    test.describe.configure({mode: 'serial'});

    let inflightLock;
    let wakeSafetyGate;
    let getLockPath;
    let BOOT_TIMEOUT_MS;

    // Test data
    const identity = '@neo-test-agent';
    const mode = 'sunset_restart';
    let lockPath;
    let gatePath;

    test.beforeAll(async () => {
        inflightLock = await import('../../../../../../ai/scripts/lifecycle/inflightLock.mjs');
        wakeSafetyGate = await import('../../../../../../ai/scripts/lifecycle/wakeSafetyGate.mjs');
        getLockPath = inflightLock.getLockPath;
        BOOT_TIMEOUT_MS = inflightLock.BOOT_TIMEOUT_MS;
    });

    test.beforeEach(async () => {
        lockPath = getLockPath(mode, identity);

        // Clean up locks
        try {
            await fs.unlink(lockPath);
        } catch(e) {}

        gatePath = path.join(os.tmpdir(), `wake-gate-test-${randomUUID()}.json`);
        process.env.WAKE_GATE_FILE_PATH = gatePath;
    });

    test.afterEach(async () => {
        try {
            await fs.unlink(lockPath);
        } catch(e) {}
        try {
            await fs.unlink(gatePath);
        } catch(e) {}
    });

    test('writeInflightLock creates a file with timestamp and abandonedCount', async () => {
        await inflightLock.writeInflightLock(identity, mode, 2);

        expect(existsSync(lockPath)).toBe(true);
        const content = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        expect(content.abandonedCount).toBe(2);
        expect(content.timestamp).toBeLessThanOrEqual(Date.now());
        expect(content.lockId).toBeTruthy();
    });

    test('checkInflightLock returns inFlight: false if no lock exists', async () => {
        const result = await inflightLock.checkInflightLock(identity, mode, Date.now());
        expect(result).toEqual({ inFlight: false, abandoned: false });
    });

    test('checkInflightLock returns inFlight: true if lock is recent', async () => {
        await inflightLock.writeInflightLock(identity, mode, 0);
        const result = await inflightLock.checkInflightLock(identity, mode, 0); // Memory is older than lock
        expect(result).toEqual({ inFlight: true, abandoned: false });
    });

    test('checkInflightLock clears lock and returns inFlight: false if memory is newer than lock', async () => {
        await inflightLock.writeInflightLock(identity, mode, 0);

        const lockContent = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        const newMemoryTimestamp = lockContent.timestamp + 1000;

        const result = await inflightLock.checkInflightLock(identity, mode, newMemoryTimestamp);
        expect(result).toEqual({ inFlight: false, abandoned: false });
        expect(existsSync(lockPath)).toBe(false); // Lock should be cleared
    });

    test('checkInflightLock returns abandoned: true if lock is older than BOOT_TIMEOUT_MS', async () => {
        await inflightLock.writeInflightLock(identity, mode, 0);

        // Backdate the lock
        const lockContent = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        lockContent.timestamp = Date.now() - BOOT_TIMEOUT_MS - 1000;
        await fs.writeFile(lockPath, JSON.stringify(lockContent, null, 2));

        const result = await inflightLock.checkInflightLock(identity, mode, 0);
        expect(result).toEqual({ inFlight: false, abandoned: true, abandonedCount: 1 });
    });

    test('checkInflightLock trips safety gate if abandoned count reaches MAX_ABANDONED_ACTIONS', async () => {
        // Abandoned 2 times already (will become 3rd time)
        await inflightLock.writeInflightLock(identity, mode, inflightLock.MAX_ABANDONED_ACTIONS - 1);

        // Backdate the lock
        const lockContent = JSON.parse(await fs.readFile(lockPath, 'utf8'));
        lockContent.timestamp = Date.now() - BOOT_TIMEOUT_MS - 1000;
        await fs.writeFile(lockPath, JSON.stringify(lockContent, null, 2));

        const result = await inflightLock.checkInflightLock(identity, mode, 0);

        // It returns abandoned: true, but no count (doesn't retry)
        expect(result).toEqual({ inFlight: false, abandoned: true });

        // Gate should be tripped
        const gateState = await wakeSafetyGate.readGateState();
        expect(gateState.state).toBe('tripped');
        expect(gateState.trippedBy).toBe('inflight-lock-monitor');
        expect(gateState.reason).toContain('consecutive abandoned actions');
    });

    test('clearInflightLock deletes the lock file', async () => {
        await inflightLock.writeInflightLock(identity, mode, 0);
        expect(existsSync(lockPath)).toBe(true);

        await inflightLock.clearInflightLock(identity, mode);
        expect(existsSync(lockPath)).toBe(false);
    });
});
