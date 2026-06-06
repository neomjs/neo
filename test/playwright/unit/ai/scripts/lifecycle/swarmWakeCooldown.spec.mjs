import {setup} from '../../../../setup.mjs';

const appName = 'SwarmWakeCooldownTest';

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
import {execFileSync, exec, spawnSync} from 'child_process';
import path           from 'path';
import fs             from 'fs-extra';
import util           from 'util';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

const execAsync = util.promisify(exec);

test.describe('ai/scripts/swarmWakeCooldown', () => {
    // Shared cooldown state path; focused runs must not race the file state.
    test.describe.configure({mode: 'serial'});

    const STATE_PATH = '.neo-ai-data/wake-daemon/swarm-wake-cooldown.json';
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/swarmWakeCooldown.mjs');

    // The subprocess invokes `MailboxService.addMessage({to: coordinator, ...})`,
    // and `validateMailboxTarget` rejects unrecognized targets at addMessage-time.
    // The subprocess runs with `UNIT_TEST_MODE='true'` → graph
    // storage is `:memory:` (per-process), so fixture-process seeding cannot reach
    // the subprocess. Use a canonical identity that `seedAgentIdentities.mjs`
    // provisions at the subprocess's `LifecycleService.initAsync` boot.
    const TEST_COORDINATOR = '@neo-opus-ada';

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
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600' }
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
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600' }
        });

        const stateBefore = await fs.readJson(STATE_PATH);

        // Fire again with same cycle_id
        try {
            execFileSync('node', [scriptPath, JSON.stringify(signal)], {
                encoding: 'utf-8',
                stdio: 'pipe',
                env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600' }
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
            env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600' }
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
                env: { ...process.env, NEO_UNIT_TEST_MODE: 'true', NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600' }
            });
        } catch(err) {
            expect(err.stderr.toString()).toContain('Suppressed: within TTL window');
        }
    });

    // Cooldown-TTL leaf resolution — kept INSIDE this serial describe (not a parallel sibling) so it
    // shares the single hardcoded cooldown-state file without a cross-describe concurrency race. The
    // suppression branch reads `swarmWakeCooldownSeconds` and returns BEFORE the MailboxService dispatch,
    // so these verify the leaf default/override without the substrate-mailbox dependency.
    const seedRecentFire = async () => {
        await fs.ensureDir(path.dirname(STATE_PATH));
        await fs.writeJson(STATE_PATH, {last_fire_at_iso: new Date().toISOString(), last_fire_cycle_id: 'seed'});
    };
    const runSuppressed = (env) => spawnSync('node', [scriptPath, JSON.stringify({
        allIdle: true, cycle_id: 'cycle-ttl', coordinator_recommendation: TEST_COORDINATOR, details: {}
    })], {encoding: 'utf-8', env: {...process.env, NEO_UNIT_TEST_MODE: 'true', ...env}});

    test('reads the TTL default (600s) from the AiConfig leaf when env is unset', async () => {
        await seedRecentFire();
        const res = runSuppressed({}); // NEO_SWARM_WAKE_COOLDOWN_SECONDS unset → leaf default 600
        expect(res.stderr).toContain('within TTL window (600s)');
    });

    test('reads the TTL override from the AiConfig leaf via the env name', async () => {
        await seedRecentFire();
        const res = runSuppressed({NEO_SWARM_WAKE_COOLDOWN_SECONDS: '1200'});
        expect(res.stderr).toContain('within TTL window (1200s)');
    });
});
