import {setup} from '../../../../setup.mjs';

const appName = 'IdleOutNudgeTest';

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
import {randomUUID}              from 'crypto';
import os                        from 'os';
import path                      from 'path';
import fs                        from 'fs';
import fsp                       from 'fs/promises';
import Neo                       from '../../../../../../src/Neo.mjs';
import * as core                 from '../../../../../../src/core/_export.mjs';

import {getLockPath, writeInflightLock} from '../../../../../../ai/scripts/lifecycle/inflightLock.mjs';

/**
 * @summary Validation for #10675 idle-out A2A nudge dispatcher.
 *
 * Mirrors the test pattern in `trioWakeCooldown.spec.mjs`: side-effect
 * verification (lock file presence/absence) + static script-content checks
 * for body convention + swarm-heartbeat integration point. The actual A2A
 * message dispatch goes through real `MailboxService` in unit-test mode (writes
 * to test-isolated Memory Core SQLite) — no mock needed; the lock-file side
 * effect is the substrate-level assertion.
 *
 * Live-host opt-in (#10681 discipline): no live `osascript` dispatch happens
 * in this script, so `RUN_LIVE_OSASCRIPT=1` opt-in is NOT required for any
 * test path here. Tests can run with default env safely.
 */
test.describe('ai/scripts/idleOutNudge', () => {
    // Shared identity-derived lock path; focused runs must not race the file state.
    test.describe.configure({mode: 'serial'});

    const scriptPath  = path.resolve(process.cwd(), 'ai/scripts/lifecycle/idleOutNudge.mjs');
    const testIdentity = '@neo-idle-out-test';
    const lockPath    = getLockPath('idle_out_nudge', testIdentity);

    let gatePath, overrideEnv, gateOnlyEnv;

    test.beforeEach(async () => {
        gatePath    = path.join(os.tmpdir(), `wake-gate-idleout-${randomUUID()}.json`);
        overrideEnv = {...process.env, WAKE_GATE_FILE_PATH: gatePath, WAKE_GATE_OVERRIDE: '1'};
        gateOnlyEnv = {...process.env, WAKE_GATE_FILE_PATH: gatePath};

        // Clean any pre-existing lock from prior runs
        if (fs.existsSync(lockPath)) await fsp.unlink(lockPath);
    });

    test.afterEach(async () => {
        if (fs.existsSync(lockPath)) await fsp.unlink(lockPath);
        if (fs.existsSync(gatePath)) await fsp.unlink(gatePath);
    });

    test('Unknown identity argument missing → exits with usage error', async () => {
        try {
            execFileSync('node', [scriptPath], {encoding: 'utf-8', stdio: 'pipe', env: overrideEnv});
            test.fail('Should have exited with error');
        } catch (e) {
            expect(e.status).toBe(1);
            expect(e.stderr).toContain('Usage: idleOutNudge.mjs <identity>');
        }
    });

    test('Wake safety gate tripped → no nudge dispatched, no lock acquired (#10648 defense)', async () => {
        // Default-tripped state (no gate file → deny-by-default per wakeSafetyGate.mjs).
        // idleOutNudge MUST skip BEFORE acquiring the lock — defense-in-depth alongside
        // the `SwarmHeartbeatService` heartbeat-lane gate check.
        const result = spawnSync('node', [scriptPath, testIdentity], {
            encoding: 'utf-8',
            env     : gateOnlyEnv  // No WAKE_GATE_OVERRIDE — exercises default-tripped path
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toContain(`Skipping idle-out nudge for ${testIdentity}`);
        expect(result.stderr).toContain('Wake safety gate');
        expect(result.stderr).toContain('WAKE_GATE_OVERRIDE=1');
        // Side effect: NO lock file should have been created
        expect(fs.existsSync(lockPath)).toBe(false);
    });

    test('In-flight lock already held → nudge skipped, lock unchanged (idempotent invariant #10675)', async () => {
        // Pre-create a lock as if a prior nudge is in-flight. The dispatcher's defensive
        // checkInflightLock guard MUST detect the lock and exit without touching it.
        await writeInflightLock(testIdentity, 'idle_out_nudge', 0);
        const lockBefore = await fsp.readFile(lockPath, 'utf-8');

        const result = spawnSync('node', [scriptPath, testIdentity], {
            encoding: 'utf-8',
            env     : overrideEnv  // Gate-override so the early-skip is the lock guard, not the gate
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toContain(`Skipping idle-out nudge for ${testIdentity}`);
        expect(result.stderr).toContain('lock already held');
        // Idempotent invariant: the existing lock file MUST be byte-identical (not rewritten).
        const lockAfter = await fsp.readFile(lockPath, 'utf-8');
        expect(lockAfter).toBe(lockBefore);
    });

    test('Static script: nudge body convention contains identity + memory-resolved framing (#10675)', async () => {
        // Per #10675 invariants, the body must communicate to the recipient:
        // - Why the nudge fired (idle threshold)
        // - That no action is needed if mid-turn / rate-limited
        // - That memory-resolved release path clears the lock automatically
        // - Bounded / non-spawning / in-place framing
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

        expect(scriptContent).toContain('idle threshold');
        expect(scriptContent).toContain('AGENTS.md §4.2');
        expect(scriptContent).toContain('memory-resolved');
        expect(scriptContent).toContain('non-spawning');
        expect(scriptContent).toContain('in-place');
        // The dispatcher consumes the inflightLock primitive
        expect(scriptContent).toContain("writeInflightLock");
        expect(scriptContent).toContain("checkInflightLock");
    });

    test('Static script: defense-in-depth — gate check + lock check before send (#10648, #10675)', async () => {
        // Verify the dispatcher's safety sequence ordering at the source level.
        // Order MUST be: gate check → lock check → lock acquire → A2A send.
        // Use the LAST occurrence of each (the actual call site, not the import).
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

        const gateCheckIndex   = scriptContent.lastIndexOf('readGateState()');
        const lockCheckIndex   = scriptContent.lastIndexOf('checkInflightLock(identity');
        const lockWriteIndex   = scriptContent.lastIndexOf('writeInflightLock(identity');
        const messageSendIndex = scriptContent.lastIndexOf('MailboxService.addMessage');

        expect(gateCheckIndex).toBeGreaterThan(-1);
        expect(lockCheckIndex).toBeGreaterThan(gateCheckIndex);
        expect(lockWriteIndex).toBeGreaterThan(lockCheckIndex);
        expect(messageSendIndex).toBeGreaterThan(lockWriteIndex);
    });

    test('Static script: send-failure path clears the lock to enable retry (#10675)', async () => {
        // The catch block on MailboxService.addMessage MUST clear the lock so a transient
        // send error doesn't block retries for the full BOOT_TIMEOUT_MS window.
        // Verify the relative ordering: send call → catch block → clearInflightLock call.
        const scriptContent = fs.readFileSync(scriptPath, 'utf-8');

        const sendIndex            = scriptContent.indexOf('MailboxService.addMessage');
        const catchIndex           = scriptContent.indexOf('catch (err)', sendIndex);
        const clearLockOnErrorIndex = scriptContent.indexOf("clearInflightLock(identity, 'idle_out_nudge')", catchIndex);

        expect(sendIndex).toBeGreaterThan(-1);
        expect(catchIndex).toBeGreaterThan(sendIndex);
        expect(clearLockOnErrorIndex).toBeGreaterThan(catchIndex);
    });

    // Note (#11766): the former `swarm-heartbeat.sh integration` test was removed with
    // the bash script. The `recommended_action: 'idle_out_nudge'` routing — ordered
    // after the sunset path and before the all-agent-idle path, gated by the wake
    // safety gate — is now covered against the JS lane in
    // `test/playwright/unit/ai/daemons/SwarmHeartbeatService.spec.mjs`.
});
