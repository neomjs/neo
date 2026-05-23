import {setup} from '../../../setup.mjs';
import fs   from 'fs/promises';
import os   from 'os';
import path from 'path';

const appName = 'SwarmHeartbeatServiceTest';

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

// Test-side entry-point bootstrap: Neo + core/_export populate `globalThis.Neo` before
// the dynamic SwarmHeartbeatService import below. Required because the class file no
// longer imports Neo itself (#11058 split — class+wrapper pattern). Mirrors the test-spec
// bootstrap pattern in TaskStateService.spec / ProcessSupervisorService.spec /
// SummarizationCoordinatorService.spec post-#11049/#11054.
import Neo       from '../../../../../src/Neo.mjs';
import * as core from '../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

/**
 * @summary Unit coverage for `ai/daemons/SwarmHeartbeatService.mjs` (#10789 AC6, #11766 fold).
 *
 * Covers: idempotent one-time `initAsync()`, concurrency-lock skip-vs-clear,
 * sunset-detection-routes-to-resumeHarness, gate-tripped blocks high-authority dispatch,
 * idle-out-nudge routing, push-capable bypass, sweep-failure isolation within `pulse()`.
 *
 * Post-#11766 the class is a lane folded into the Orchestrator: the Orchestrator owns the
 * scheduler. There is no self-rescheduling loop, no `start()`/`stop()`/`scheduleNext()`;
 * `initAsync()` runs once and `pulse()` runs once per Orchestrator cadence tick. The
 * Orchestrator's lane executor provides per-pulse failure isolation — `pulse()` itself
 * has no try/finally.
 *
 * Stubbing strategy: SwarmHeartbeatService exposes test-stubbable instance-method seams
 * (`checkHeartbeatLock`, `clearHeartbeatLock`, `sweepExpiredTasks`, `checkGateOpen`,
 * `readGate`, `checkSunsetted`, `resumeHarness`, `idleOutNudge`, `checkAllAgentIdle`,
 * `trioWakeCooldown`, `runScript`, `runScriptJson`, `runCmd`, `getUnreadCount`,
 * `getIssuesCount`, `isPushCapable`, `injectTmux`) precisely so unit tests can override them without going
 * through the heavy substrate. Module-binding imports (e.g. `isGateOpen`) cannot be
 * reassigned at import-site in ES modules — instance methods are the seam that works.
 *
 * Each test stubs only what it needs; `afterEach` resets singleton state so cases don't bleed.
 */
test.describe('Neo.ai.daemons.SwarmHeartbeatService', () => {
    let SwarmHeartbeatService;
    let originalLifecycleInit;
    let originalGraphServiceInit;

    test.beforeAll(async () => {
        SwarmHeartbeatService = (await import('../../../../../ai/daemons/SwarmHeartbeatService.mjs')).default;

        const services = await import('../../../../../ai/services.mjs');
        const LifecycleService = services.Memory_LifecycleService;
        const GraphService     = services.Memory_GraphService;

        originalLifecycleInit    = LifecycleService.initAsync;
        originalGraphServiceInit = GraphService.initAsync;

        // Stub heavy boot — pulse logic uses only `GraphService.db.storage.db`,
        // which the per-test stubs override at the method level.
        LifecycleService.initAsync = async () => {};
        GraphService.initAsync     = async () => {};
    });

    test.afterAll(async () => {
        const services = await import('../../../../../ai/services.mjs');
        services.Memory_LifecycleService.initAsync = originalLifecycleInit;
        services.Memory_GraphService.initAsync     = originalGraphServiceInit;
    });

    /**
     * Apply a default no-op stub set so every test starts from a deterministic baseline.
     * Individual tests override the seams they care about.
     */
    function applyDefaultStubs() {
        // SwarmHeartbeatService is a Neo singleton — reset the one-time-init flag so each
        // test starts from a clean lifecycle state regardless of prior-test or cross-file
        // singleton-state bleed (symmetric with the afterEach reset).
        SwarmHeartbeatService.isInitialized = false;
        SwarmHeartbeatService.touchLivenessFile = async () => {};
        SwarmHeartbeatService.checkHeartbeatLock = async () => ({active: false, stale: false, ageMs: 0});
        SwarmHeartbeatService.clearHeartbeatLock = async () => {};
        SwarmHeartbeatService.sweepExpiredTasks  = async () => ({sweptCount: 0});
        SwarmHeartbeatService.checkGateOpen      = async () => true;
        SwarmHeartbeatService.readGate           = async () => ({state: 'enabled', reason: '', trippedAt: null, trippedBy: null});
        SwarmHeartbeatService.checkSunsetted     = async () => null;
        SwarmHeartbeatService.resumeHarness      = async () => {};
        SwarmHeartbeatService.idleOutNudge       = async () => {};
        SwarmHeartbeatService.checkAllAgentIdle  = async () => null;
        SwarmHeartbeatService.trioWakeCooldown   = async () => {};
        SwarmHeartbeatService.runScriptJson      = async () => null;
        SwarmHeartbeatService.runScript          = async () => '';
        SwarmHeartbeatService.runCmd             = async () => '[]';
        SwarmHeartbeatService.getUnreadCount     = async () => 0;
        SwarmHeartbeatService.getIssuesCount     = async () => 0;
        SwarmHeartbeatService.isPushCapable      = async () => false;
        SwarmHeartbeatService.injectTmux         = async () => {};
        SwarmHeartbeatService.identity           = '@test';
    }

    test.afterEach(async () => {
        SwarmHeartbeatService.isInitialized  = false;
        SwarmHeartbeatService.identity       = null;
        SwarmHeartbeatService.pollIntervalMs = 5 * 60 * 1000;
    });

    test('initAsync() is idempotent — second call is a no-op once initialized', async () => {
        applyDefaultStubs();

        await SwarmHeartbeatService.initAsync({identity: '@test', pollIntervalMs: 60_000});
        expect(SwarmHeartbeatService.isInitialized).toBe(true);

        // A second call short-circuits on the isInitialized guard and does NOT
        // re-resolve identity — proven by passing a different identity that must be ignored.
        await SwarmHeartbeatService.initAsync({identity: '@second', pollIntervalMs: 60_000});
        expect(SwarmHeartbeatService.identity).toBe('@test');
    });

    test('initAsync() picks identity from explicit arg, then env, then default', async () => {
        applyDefaultStubs();

        // Explicit arg wins.
        await SwarmHeartbeatService.initAsync({identity: '@explicit', pollIntervalMs: 60_000});
        expect(SwarmHeartbeatService.identity).toBe('@explicit');
        SwarmHeartbeatService.isInitialized = false;

        // Env-var falls in when arg absent.
        const original = process.env.NEO_AGENT_IDENTITY;
        process.env.NEO_AGENT_IDENTITY = '@from-env';
        try {
            await SwarmHeartbeatService.initAsync({pollIntervalMs: 60_000});
            expect(SwarmHeartbeatService.identity).toBe('@from-env');
        } finally {
            if (original === undefined) delete process.env.NEO_AGENT_IDENTITY;
            else                        process.env.NEO_AGENT_IDENTITY = original;
        }
    });

    test('initAsync() normalizes GitHub-login identity form to AgentIdentity node id (#11797)', async () => {
        applyDefaultStubs();

        await SwarmHeartbeatService.initAsync({identity: 'neo-opus-4-7', pollIntervalMs: 60_000});
        expect(SwarmHeartbeatService.identity).toBe('@neo-opus-4-7');
        SwarmHeartbeatService.isInitialized = false;

        const original = process.env.NEO_AGENT_IDENTITY;
        process.env.NEO_AGENT_IDENTITY = 'neo-gpt';
        try {
            await SwarmHeartbeatService.initAsync({pollIntervalMs: 60_000});
            expect(SwarmHeartbeatService.identity).toBe('@neo-gpt');
        } finally {
            if (original === undefined) delete process.env.NEO_AGENT_IDENTITY;
            else                        process.env.NEO_AGENT_IDENTITY = original;
        }
    });

    test('pulse() skips when concurrency lock is active', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.checkHeartbeatLock = async () => ({active: true, stale: false, ageMs: 1000});

        const sweepCalls = [];
        SwarmHeartbeatService.sweepExpiredTasks = async () => { sweepCalls.push(Date.now()); return {sweptCount: 0} };

        await SwarmHeartbeatService.pulse();

        expect(sweepCalls.length).toBe(0); // Active lock → early return; no sweep dispatched.
    });

    test('pulse() clears stale lock and continues to sweep', async () => {
        applyDefaultStubs();
        let releaseCalled = false;
        SwarmHeartbeatService.checkHeartbeatLock = async () => ({active: false, stale: true, ageMs: 999_999});
        SwarmHeartbeatService.clearHeartbeatLock = async () => { releaseCalled = true };

        const sweepCalls = [];
        SwarmHeartbeatService.sweepExpiredTasks = async () => { sweepCalls.push(Date.now()); return {sweptCount: 0} };

        await SwarmHeartbeatService.pulse();

        expect(releaseCalled).toBe(true);
        expect(sweepCalls.length).toBe(1);
    });

    test('pulse() skips fresh-session-spawn when wake safety gate is closed', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.checkGateOpen = async () => false;
        SwarmHeartbeatService.readGate      = async () => ({state: 'tripped', reason: 'test-tripped', trippedAt: null, trippedBy: 'test'});

        const resumeCalls = [];
        SwarmHeartbeatService.checkSunsetted = async () => {
            return {
                sunsetted          : true,
                reason             : 'No active WAKE_SUBSCRIPTION',
                originSessionId    : 'sid-123',
                abandonedCount     : 0,
                recommended_action : 'sunset_restart'
            };
        };
        SwarmHeartbeatService.resumeHarness = async (...args) => { resumeCalls.push(args) };

        await SwarmHeartbeatService.pulse();

        // Gate closed → no resumeHarness dispatch.
        expect(resumeCalls.length).toBe(0);
    });

    test('pulse() routes sunset to resumeHarness when gate is open', async () => {
        applyDefaultStubs();
        const resumeCalls = [];
        SwarmHeartbeatService.checkSunsetted = async () => {
            return {
                sunsetted          : true,
                reason             : 'Subscription missing',
                originSessionId    : 'sid-456',
                abandonedCount     : 2,
                recommended_action : 'sunset_restart'
            };
        };
        SwarmHeartbeatService.resumeHarness = async (...args) => { resumeCalls.push(args) };

        await SwarmHeartbeatService.pulse();

        expect(resumeCalls.length).toBe(1);
        expect(resumeCalls[0]).toEqual(['@test', 'Subscription missing', 'sid-456', 2]);
    });

    test('pulse() routes idle_out_nudge when gate is open and recommendation matches', async () => {
        applyDefaultStubs();
        const nudgeCalls = [];
        SwarmHeartbeatService.checkSunsetted = async () => {
            return {
                sunsetted          : false,
                recommended_action : 'idle_out_nudge'
            };
        };
        SwarmHeartbeatService.idleOutNudge = async (...args) => { nudgeCalls.push(args) };

        await SwarmHeartbeatService.pulse();

        expect(nudgeCalls.length).toBe(1);
        expect(nudgeCalls[0]).toEqual(['@test']);
    });

    test('pulse() skips idle_out_nudge when gate is closed', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.checkGateOpen = async () => false;

        const nudgeCalls = [];
        SwarmHeartbeatService.checkSunsetted = async () => ({sunsetted: false, recommended_action: 'idle_out_nudge'});
        SwarmHeartbeatService.idleOutNudge   = async (...args) => { nudgeCalls.push(args) };

        await SwarmHeartbeatService.pulse();

        expect(nudgeCalls.length).toBe(0);
    });

    test('pulse() routes allIdle to trioWakeCooldown when gate is open', async () => {
        applyDefaultStubs();
        const trioCalls = [];
        SwarmHeartbeatService.checkAllAgentIdle = async () => ({allIdle: true, cycle_id: '1', identities: ['@a', '@b']});
        SwarmHeartbeatService.trioWakeCooldown  = async (signal) => { trioCalls.push(signal) };

        await SwarmHeartbeatService.pulse();

        expect(trioCalls.length).toBe(1);
        expect(trioCalls[0].allIdle).toBe(true);
    });

    test('pulse() does not subprocess-dispatch converted dual-mode wake scripts', async () => {
        applyDefaultStubs();
        const sunsetCalls = [];
        const idleCalls = [];

        SwarmHeartbeatService.checkSunsetted = async (identity) => {
            sunsetCalls.push(identity);
            return {sunsetted: false, recommended_action: 'no_action'};
        };
        SwarmHeartbeatService.checkAllAgentIdle = async (...args) => {
            idleCalls.push(args);
            return {allIdle: false};
        };
        SwarmHeartbeatService.runScript = async () => {
            throw new Error('runScript should not be called for converted wake scripts');
        };
        SwarmHeartbeatService.runScriptJson = async () => {
            throw new Error('runScriptJson should not be called for converted wake scripts');
        };

        await SwarmHeartbeatService.pulse();

        expect(sunsetCalls).toEqual(['@test']);
        expect(idleCalls).toEqual([[]]);
    });

    test('pulse() isolates a sweep failure locally and continues to later steps', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.sweepExpiredTasks = async () => { throw new Error('substrate down') };
        SwarmHeartbeatService.getUnreadCount    = async () => 2;

        const injected = [];
        SwarmHeartbeatService.injectTmux = async (p) => { injected.push(p) };

        // Sweep throws but is caught by the inner try/catch around the sweep step;
        // pulse() does not propagate the error and proceeds to inject.
        await expect(SwarmHeartbeatService.pulse()).resolves.toBeUndefined();
        expect(injected.length).toBe(1);
    });

    test('pulse() injects tmux prompt only when actionable state exists', async () => {
        applyDefaultStubs();

        const injected = [];
        SwarmHeartbeatService.injectTmux = async (prompt) => { injected.push(prompt) };

        // Case 1: no unread, no issues — no injection.
        await SwarmHeartbeatService.pulse();
        expect(injected.length).toBe(0);

        // Case 2: unread present — inject.
        SwarmHeartbeatService.getUnreadCount = async () => 3;

        await SwarmHeartbeatService.pulse();
        expect(injected.length).toBe(1);
        expect(injected[0]).toContain('Mailbox unread: 3');
        expect(injected[0]).toContain('Open issues assigned: 0');
    });

    test('pulse() respects heartbeat-bypass for push-capable identities', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.isPushCapable  = async () => true;
        SwarmHeartbeatService.getUnreadCount = async () => 99;
        SwarmHeartbeatService.getIssuesCount = async () => 99;

        const injected = [];
        SwarmHeartbeatService.injectTmux = async (p) => { injected.push(p) };

        await SwarmHeartbeatService.pulse();
        // Push-capable bypass — no tmux injection even with high unread count.
        expect(injected.length).toBe(0);
    });

    test('pulse() includes expired-count in prompt when sweep yields > 0', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.sweepExpiredTasks = async () => ({sweptCount: 5});
        SwarmHeartbeatService.getUnreadCount    = async () => 1;

        const injected = [];
        SwarmHeartbeatService.injectTmux = async (p) => { injected.push(p) };

        await SwarmHeartbeatService.pulse();
        expect(injected.length).toBe(1);
        expect(injected[0]).toContain('Tasks expired this cycle: 5');
    });

    test('pulse() touches the heartbeat-liveness file HealthService reads (#11766)', async () => {
        applyDefaultStubs();
        // Un-stub touchLivenessFile so the real producer runs against an isolated path.
        delete SwarmHeartbeatService.touchLivenessFile;

        const alivePath = path.join(os.tmpdir(), `neo-heartbeat-alive-${Date.now()}.alive`);
        const original  = process.env.NEO_HEARTBEAT_ALIVE_PATH;
        process.env.NEO_HEARTBEAT_ALIVE_PATH = alivePath;

        try {
            const before = Date.now();
            await SwarmHeartbeatService.pulse();

            // The liveness file now exists with a fresh mtime — the producer side of the
            // `HealthService.daemonRunning` contract restored after the #11766 fold.
            const stat = await fs.stat(alivePath);
            expect(stat.mtime.getTime()).toBeGreaterThanOrEqual(before - 1000);
        } finally {
            if (original === undefined) delete process.env.NEO_HEARTBEAT_ALIVE_PATH;
            else                        process.env.NEO_HEARTBEAT_ALIVE_PATH = original;
            await fs.rm(alivePath, {force: true});
        }
    });
});
