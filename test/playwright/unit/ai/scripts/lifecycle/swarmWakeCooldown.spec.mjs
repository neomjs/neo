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

import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'child_process';
import path                      from 'path';
import fs                        from 'fs-extra';
import os                        from 'os';
import Neo                       from '../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../src/core/_export.mjs';

test.describe('ai/scripts/swarmWakeCooldown', () => {
    // Shared cooldown state path; focused runs must not race the file state.
    test.describe.configure({mode: 'serial'});

    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/swarmWakeCooldown.mjs');
    let statePath, wakeDaemonDir, workDir;

    // The subprocess invokes `MailboxService.addMessage({to: coordinator, ...})`,
    // and `validateMailboxTarget` rejects unrecognized targets at addMessage-time.
    // The subprocess runs with `UNIT_TEST_MODE='true'` → graph
    // storage is `:memory:` (per-process), so fixture-process seeding cannot reach
    // the subprocess. Use a canonical identity that `seedAgentIdentities.mjs`
    // provisions at the subprocess's `LifecycleService.initAsync` boot.
    const TEST_COORDINATOR = '@neo-opus-ada';

    test.beforeEach(async () => {
        workDir       = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-swarm-wake-cooldown-'));
        wakeDaemonDir = path.join(workDir, '.neo-ai-data', 'wake-daemon');
        statePath     = path.join(wakeDaemonDir, 'swarm-wake-cooldown.json');
    });

    test.afterEach(async () => {
        await fs.remove(workDir)
    });

    const childOptions = (env={}) => ({
        cwd     : workDir,
        encoding: 'utf-8',
        env     : {
            ...process.env,
            NEO_AI_DAEMON_DIR : wakeDaemonDir,
            NEO_UNIT_TEST_MODE: 'true',
            ...env
        }
    });

    test('emits WAKE message on first detection (Positive)', async () => {
        const signal = {
            allIdle                   : true,
            cycle_id                  : 'cycle-101',
            identities                : [TEST_COORDINATOR],
            coordinator_recommendation: TEST_COORDINATOR,
            details                   : {}
        };

        const output = execFileSync('node', [scriptPath, JSON.stringify(signal)],
            childOptions({NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600'}));

        // The script writes to stderr when it fires
        expect(output).toBe(''); // stdout is empty

        const state = await fs.readJson(statePath);
        expect(state.last_fire_cycle_id).toBe('cycle-101');
        expect(state.ttl_seconds).toBe(600);
    });

    test('suppresses subsequent identical signals within TTL (Suppression)', async () => {
        const signal = {
            allIdle                   : true,
            cycle_id                  : 'cycle-102',
            identities                : [TEST_COORDINATOR],
            coordinator_recommendation: TEST_COORDINATOR,
            details                   : {}
        };

        // Fire once
        execFileSync('node', [scriptPath, JSON.stringify(signal)],
            childOptions({NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600'}));

        const stateBefore = await fs.readJson(statePath);

        // Fire again with same cycle_id
        try {
            execFileSync('node', [scriptPath, JSON.stringify(signal)], {
                ...childOptions({NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600'}),
                stdio: 'pipe'
            });
        } catch(err) {
            expect(err.stderr.toString()).toContain('Suppressed: within TTL window');
        }

        const stateAfter = await fs.readJson(statePath);
        // Ensure state wasn't updated
        expect(stateAfter.last_fire_at_iso).toBe(stateBefore.last_fire_at_iso);
    });

    test('fires fresh when cycle_id changes even within TTL (Cycle Rotation)', async () => {
        const signal1 = {
            allIdle                   : true,
            cycle_id                  : 'cycle-201',
            identities                : [TEST_COORDINATOR],
            coordinator_recommendation: TEST_COORDINATOR,
            details                   : {}
        };

        execFileSync('node', [scriptPath, JSON.stringify(signal1)],
            childOptions({NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600'}));

        const signal2 = {
            ...signal1,
            cycle_id: 'cycle-202'
        };

        // Try firing signal2 immediately (within TTL)
        try {
            execFileSync('node', [scriptPath, JSON.stringify(signal2)], {
                ...childOptions({NEO_SWARM_WAKE_COOLDOWN_SECONDS: '600'}),
                stdio: 'pipe'
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
        await fs.ensureDir(path.dirname(statePath));
        await fs.writeJson(statePath, {last_fire_at_iso: new Date().toISOString(), last_fire_cycle_id: 'seed'});
    };
    const runSuppressed = (env) => spawnSync('node', [scriptPath, JSON.stringify({
        allIdle: true, cycle_id: 'cycle-ttl', coordinator_recommendation: TEST_COORDINATOR, details: {}
    })], childOptions(env));

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
