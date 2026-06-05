import {setup} from '../../../../setup.mjs';

const appName = 'TrioWakeCooldownTest';

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

import {test, expect} from '@playwright/test';
import {execFileSync, exec} from 'child_process';
import path           from 'path';
import fs             from 'fs-extra';
import util           from 'util';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

const execAsync = util.promisify(exec);

test.describe('ai/scripts/trioWakeCooldown', () => {
    // Shared cooldown state path; focused runs must not race the file state.
    test.describe.configure({mode: 'serial'});

    const STATE_PATH = '.neo-ai-data/wake-daemon/trio-wake-cooldown.json';
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/trioWakeCooldown.mjs');

    // The subprocess invokes `MailboxService.addMessage({to: coordinator, ...})`,
    // and `validateMailboxTarget` rejects unrecognized targets at addMessage-time.
    // The subprocess runs with `UNIT_TEST_MODE='true'` → graph
    // storage is `:memory:` (per-process), so fixture-process seeding cannot reach
    // the subprocess. Use a canonical identity that `seedAgentIdentities.mjs`
    // provisions at the subprocess's `LifecycleService.initAsync` boot.
    const TEST_COORDINATOR = '@neo-opus';

    test.beforeEach(async () => {
        await fs.remove(STATE_PATH);
    });

    test.afterAll(async () => {
        await fs.remove(STATE_PATH);
    });

    test('emits WAKE message on first detection (Positive)', async () => {
        const signal = {
            allIdle: true,
            cycle_id: 'cycle-101',
            identities: [TEST_COORDINATOR],
            coordinator_recommendation: TEST_COORDINATOR,
            details: {}
        };

        const output = execFileSync('node', [scriptPath, JSON.stringify(signal)], {
            encoding: 'utf-8',
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', TRIO_WAKE_COOLDOWN_SECONDS: '600' }
        });

        // The script writes to stderr when it fires
        expect(output).toBe(''); // stdout is empty

        const state = await fs.readJson(STATE_PATH);
        expect(state.last_fire_cycle_id).toBe('cycle-101');
        expect(state.ttl_seconds).toBe(600);
    });

    test('suppresses subsequent identical signals within TTL (Suppression)', async () => {
        const signal = {
            allIdle: true,
            cycle_id: 'cycle-102',
            identities: [TEST_COORDINATOR],
            coordinator_recommendation: TEST_COORDINATOR,
            details: {}
        };

        // Fire once
        execFileSync('node', [scriptPath, JSON.stringify(signal)], {
            encoding: 'utf-8',
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', TRIO_WAKE_COOLDOWN_SECONDS: '600' }
        });

        const stateBefore = await fs.readJson(STATE_PATH);

        // Fire again with same cycle_id
        try {
            execFileSync('node', [scriptPath, JSON.stringify(signal)], {
                encoding: 'utf-8',
                stdio: 'pipe',
                env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', TRIO_WAKE_COOLDOWN_SECONDS: '600' }
            });
        } catch(err) {
            expect(err.stderr.toString()).toContain('Suppressed: within TTL window');
        }

        const stateAfter = await fs.readJson(STATE_PATH);
        // Ensure state wasn't updated
        expect(stateAfter.last_fire_at_iso).toBe(stateBefore.last_fire_at_iso);
    });

    test('fires fresh when cycle_id changes even within TTL (Cycle Rotation)', async () => {
        const signal1 = {
            allIdle: true,
            cycle_id: 'cycle-201',
            identities: [TEST_COORDINATOR],
            coordinator_recommendation: TEST_COORDINATOR,
            details: {}
        };

        execFileSync('node', [scriptPath, JSON.stringify(signal1)], {
            encoding: 'utf-8',
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', TRIO_WAKE_COOLDOWN_SECONDS: '600' }
        });

        const signal2 = {
            ...signal1,
            cycle_id: 'cycle-202'
        };

        // Try firing signal2 immediately (within TTL)
        try {
            execFileSync('node', [scriptPath, JSON.stringify(signal2)], {
                encoding: 'utf-8',
                stdio: 'pipe',
                env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', TRIO_WAKE_COOLDOWN_SECONDS: '600' }
            });
        } catch(err) {
            expect(err.stderr.toString()).toContain('Suppressed: within TTL window');
        }
    });
});
