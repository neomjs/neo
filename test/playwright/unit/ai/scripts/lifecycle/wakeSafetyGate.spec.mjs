import {setup} from '../../../../setup.mjs';

const appName = 'WakeSafetyGateTest';

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

import {test, expect}    from '@playwright/test';
import {execFileSync}    from 'child_process';
import {randomUUID}      from 'crypto';
import fs                from 'fs';
import os                from 'os';
import path              from 'path';
import Neo               from '../../../../../../src/Neo.mjs';
import * as core         from '../../../../../../src/core/_export.mjs';

/**
 * @summary Validation for the Wake Safety Gate primitive (#10648, child of #10647).
 *
 * Covers the deny-by-default discipline (missing file → tripped), state-file
 * round-trip (enable / disable / trip), CLI surface (check / reason / show),
 * and the operator override (`WAKE_GATE_OVERRIDE=1`). The gate is consumed by
 * the `SwarmHeartbeatService` heartbeat lane and `resumeHarness.mjs` — those
 * integrations have their own specs; this file isolates the gate primitive.
 */
test.describe('ai/scripts/wakeSafetyGate', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/lifecycle/wakeSafetyGate.mjs');

    /**
     * Each test gets its own gate-file path via the `WAKE_GATE_FILE_PATH`
     * env-var override (production unset, tests set explicitly). This avoids
     * the singleton on-disk collision that surfaces under Playwright's
     * fullyParallel mode — peer specs (e.g. `resumeHarness.spec.mjs`) also
     * touch the gate file and would race against tests in this describe.
     * Per-test unique tmp paths make the suite hermetic regardless of
     * worker-level parallelism.
     */
    let gatePath, gateEnv;

    test.beforeEach(() => {
        gatePath = path.join(os.tmpdir(), `wake-gate-test-${randomUUID()}.json`);
        gateEnv  = {...process.env, WAKE_GATE_FILE_PATH: gatePath};
    });

    test.afterEach(() => {
        if (fs.existsSync(gatePath)) fs.unlinkSync(gatePath);
    });

    /**
     * Helper: invoke the CLI with the per-test gate-file env-var bound. Captures
     * stdout, stderr, and exit code so individual tests can assert on whichever
     * surface they care about. Defaults to `gateEnv` (per-test isolation); tests
     * that want to layer additional env (e.g. `WAKE_GATE_OVERRIDE`) merge into
     * `extraEnv`.
     */
    const runCli = (args, extraEnv = {}) => {
        try {
            const stdout = execFileSync('node', [scriptPath, ...args], {
                encoding: 'utf-8',
                stdio   : 'pipe',
                env     : {...gateEnv, ...extraEnv}
            });
            return {status: 0, stdout, stderr: ''};
        } catch (e) {
            return {status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? ''};
        }
    };

    test('CLI check exits 1 when no gate file exists (deny-by-default)', () => {
        expect(runCli(['check']).status).toBe(1);
    });

    test('CLI reason explains the default-tripped state when no gate file exists', () => {
        const {stdout} = runCli(['reason']);
        expect(stdout).toContain('No gate state file present');
        expect(stdout).toContain('deny-by-default');
    });

    test('CLI show emits structured JSON with state=tripped by default', () => {
        const parsed = JSON.parse(runCli(['show']).stdout);
        expect(parsed.state).toBe('tripped');
        expect(parsed.trippedBy).toBe('default-on-missing-file');
    });

    test('CLI enable writes enabled state and check passes afterwards', () => {
        expect(runCli(['enable']).status).toBe(0);

        const written = JSON.parse(fs.readFileSync(gatePath, 'utf-8'));
        expect(written.state).toBe('enabled');

        expect(runCli(['check']).status).toBe(0);
    });

    test('CLI trip writes tripped state with reason and trippedBy', () => {
        expect(runCli(['trip', '--reason=test reason text', '--by=spec-runner']).status).toBe(0);

        const written = JSON.parse(fs.readFileSync(gatePath, 'utf-8'));
        expect(written.state    ).toBe('tripped');
        expect(written.reason   ).toBe('test reason text');
        expect(written.trippedBy).toBe('spec-runner');
        expect(written.trippedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('CLI disable writes disabled state', () => {
        expect(runCli(['disable', '--reason=maintenance']).status).toBe(0);
        const written = JSON.parse(fs.readFileSync(gatePath, 'utf-8'));
        expect(written.state ).toBe('disabled');
        expect(written.reason).toBe('maintenance');
    });

    test('CLI check exits 1 when state is tripped', () => {
        runCli(['trip', '--reason=test']);
        expect(runCli(['check']).status).toBe(1);
    });

    test('Operator override WAKE_GATE_OVERRIDE=1 makes check exit 0 even when tripped', () => {
        runCli(['trip', '--reason=test']);
        expect(runCli(['check']                                 ).status).toBe(1);
        expect(runCli(['check'], {WAKE_GATE_OVERRIDE: '1'}      ).status).toBe(0);
    });

    test('Override sentinel "0" or "false" is treated as not-set', () => {
        runCli(['trip', '--reason=test']);

        for (const falseyValue of ['0', 'false', '']) {
            const result = runCli(['check'], {WAKE_GATE_OVERRIDE: falseyValue});
            expect(result.status, `WAKE_GATE_OVERRIDE=${JSON.stringify(falseyValue)} should NOT bypass`).toBe(1);
        }
    });

    test('Malformed gate file is treated as tripped (deny-by-default fallback)', () => {
        fs.mkdirSync(path.dirname(gatePath), {recursive: true});
        fs.writeFileSync(gatePath, '{not valid json', 'utf-8');

        const parsed = JSON.parse(runCli(['show']).stdout);
        expect(parsed.state    ).toBe('tripped');
        expect(parsed.trippedBy).toBe('read-error');
    });

    test('Atomic write — partial state file from concurrent operator update is not observable', () => {
        // The implementation writes to a `.tmp-<pid>` file then renames. After the rename
        // completes, readers see either the prior state or the new state, never a partial.
        // This test exercises the round-trip and verifies no temp files leak.
        runCli(['enable']);
        runCli(['trip', '--reason=second-write']);

        const finalState = JSON.parse(fs.readFileSync(gatePath, 'utf-8'));
        expect(finalState.state ).toBe('tripped');
        expect(finalState.reason).toBe('second-write');

        // No temp files left behind for this gate file's basename
        const dir         = path.dirname(gatePath);
        const baseName    = path.basename(gatePath);
        const files       = fs.readdirSync(dir);
        const tmpsForThis = files.filter(f => f.startsWith(`${baseName}.tmp`));
        expect(tmpsForThis).toHaveLength(0);
    });
});
