import {setup} from '../../../../../setup.mjs';
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
// bootstrap pattern in TaskStateService.spec / ProcessSupervisorService.spec post-#11049/#11054.
import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

/**
 * @summary Unit coverage for `ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs` (#10789 AC6, #11766 fold).
 *
 * Covers: `beforeSetIdentity` normalization + null-on-empty fork-safety,
 * concurrency-lock skip-vs-clear, sunset-detection-routes-to-resumeHarness, gate-tripped
 * blocks high-authority dispatch, idle-out-nudge routing, push-capable bypass,
 * sweep-failure isolation within `pulse()`.
 *
 * Post-#11874 (core.Base contract restoration): `initAsync()` is identity-agnostic
 * (peer-service `.ready()` calls only — no `process.env` reads, no `isInitialized`
 * band-aid, no manual idempotency guard). The framework triggers it ONCE during
 * singleton creation; external callers MUST use `await service.ready()` to wait for
 * completion. Identity / pollIntervalMs are pulse-time runtime config set by the
 * parent (Orchestrator) via reactive config assignment BEFORE `await
 * service.ready()` in `start()` (the framework already fired identity-agnostic
 * `initAsync()` at module-load, so the BEFORE-`.ready()` ordering matches the
 * `Orchestrator.start()` code); tests assign them directly via property write
 * post-fixture-setup to exercise `beforeSetIdentity` normalization without
 * needing the Orchestrator wire-up dance.
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
 * Each test stubs only what it needs; `afterEach` resets identity/pollIntervalMs to
 * baselines so cases don't bleed.
 */
test.describe('Neo.ai.daemons.SwarmHeartbeatService', () => {
    let SwarmHeartbeatService;
    let heartbeatAlivePath;
    let GraphService;
    let originalLifecycleInit;
    let originalGraphServiceInit;

    test.beforeAll(async () => {
        const swarmHeartbeatModule = await import('../../../../../../../ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs');
        SwarmHeartbeatService = swarmHeartbeatModule.default;
        heartbeatAlivePath    = swarmHeartbeatModule.heartbeatAlivePath;

        const services = await import('../../../../../../../ai/services.mjs');
        const LifecycleService = services.Memory_LifecycleService;
        GraphService           = services.Memory_GraphService;

        originalLifecycleInit    = LifecycleService.initAsync;
        originalGraphServiceInit = GraphService.initAsync;

        // Stub heavy boot — pulse logic uses only `GraphService.db.storage.db`,
        // which the per-test stubs override at the method level.
        LifecycleService.initAsync = async () => {};
        GraphService.initAsync     = async () => {};
    });

    test.afterAll(async () => {
        const services = await import('../../../../../../../ai/services.mjs');
        services.Memory_LifecycleService.initAsync = originalLifecycleInit;
        services.Memory_GraphService.initAsync     = originalGraphServiceInit;
    });

    /**
     * Apply a default no-op stub set so every test starts from a deterministic baseline.
     * Individual tests override the seams they care about.
     *
     * Post-#11874: `identity` assignment exercises `beforeSetIdentity` normalization;
     * no explicit `await SwarmHeartbeatService.ready()` is needed for downstream
     * `pulse()` tests because peer-service stubs (LifecycleService/GraphService
     * initAsync no-ops in beforeAll) make the framework's #readyPromise resolve fast
     * during singleton creation at module-load.
     */
    function applyDefaultStubs() {
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
        SwarmHeartbeatService.getWakeSubscriptionIdentities = async () => [];
        SwarmHeartbeatService.runScriptJson      = async () => null;
        SwarmHeartbeatService.runScript          = async () => '';
        SwarmHeartbeatService.runCmd             = async () => '[]';
        delete SwarmHeartbeatService.getGraphDb;
        SwarmHeartbeatService.getUnreadCount     = async () => 0;
        SwarmHeartbeatService.getIssuesCount     = async () => 0;
        SwarmHeartbeatService.isPushCapable      = async () => false;
        SwarmHeartbeatService.injectTmux         = async () => {};
        // Identity assignment exercises beforeSetIdentity normalizer (no-op for
        // already-canonical '@test' form). pollIntervalMs is direct config assignment.
        SwarmHeartbeatService.identity           = '@test';
        SwarmHeartbeatService.pollIntervalMs     = 60_000;
    }

    test.afterEach(async () => {
        // Reset identity/pollIntervalMs/targetSource/explicitTargets to fresh-creation
        // baselines so cases don't bleed across tests. Framework #readyPromise handles
        // initAsync idempotency without needing an explicit reset.
        SwarmHeartbeatService.identity        = null;
        SwarmHeartbeatService.pollIntervalMs  = 5 * 60 * 1000;
        SwarmHeartbeatService.targetSource    = null;
        SwarmHeartbeatService.explicitTargets = null;
        delete SwarmHeartbeatService.getGraphDb;
    });

    test('beforeSetIdentity normalizes GitHub-login form + returns null on empty', async () => {
        // GitHub-login form: 'neo-opus-4-7' → '@neo-opus-4-7' (normalizer prepends '@')
        SwarmHeartbeatService.identity = 'neo-opus-4-7';
        expect(SwarmHeartbeatService.identity).toBe('@neo-opus-4-7');

        // Canonical form passes through unchanged
        SwarmHeartbeatService.identity = '@neo-gpt';
        expect(SwarmHeartbeatService.identity).toBe('@neo-gpt');

        // Empty values return null so unconfigured deployments surface the
        // misconfiguration via the resolver's disables-with-log path rather than
        // silently inheriting a maintainer identity. External operators must set
        // NEO_AGENT_IDENTITY or swarmHeartbeat.targetSource: 'disabled'.
        SwarmHeartbeatService.identity = null;
        expect(SwarmHeartbeatService.identity).toBeNull();

        // Empty string also returns null (treated as no-value)
        SwarmHeartbeatService.identity = '';
        expect(SwarmHeartbeatService.identity).toBeNull();
    });

    test('pulse() with null identity + default targetSource pulses zero identities', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.identity = null;  // external fork misconfiguration scenario

        const sunsetChecks = [];
        SwarmHeartbeatService.checkSunsetted = async (identity) => {
            sunsetChecks.push(identity);
            return {sunsetted: false, recommended_action: 'no_action'};
        };

        await SwarmHeartbeatService.pulse();

        // Zero per-identity iterations — the lane silently no-ops (no identity leak).
        // Substrate maintenance (sweep, all-agent-idle) still ran.
        expect(sunsetChecks).toEqual([]);
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
        SwarmHeartbeatService.checkSunsetted = async (identity) => {
            return {
                identity,
                sunsetted          : false,
                recommended_action : identity === '@test' ? 'idle_out_nudge' : 'no_action'
            };
        };
        SwarmHeartbeatService.idleOutNudge = async (...args) => { nudgeCalls.push(args) };

        await SwarmHeartbeatService.pulse();

        expect(nudgeCalls.length).toBe(1);
        expect(nudgeCalls[0]).toEqual(['@test']);
    });

    test('pulse() with targetSource=active-subscribers checks WAKE_SUBSCRIPTION identities in addition to primary identity', async () => {
        applyDefaultStubs();
        // Default targetSource is null → resolver `'self'` for fork-safety; opt-in to
        // 'active-subscribers' to exercise the union-with-WAKE_SUBSCRIPTION shape.
        SwarmHeartbeatService.targetSource = 'active-subscribers';

        const sunsetChecks = [];
        SwarmHeartbeatService.getWakeSubscriptionIdentities = async () => ['@neo-opus-4-7', '@neo-gpt', '@neo-gpt'];
        SwarmHeartbeatService.checkSunsetted = async (identity) => {
            sunsetChecks.push(identity);
            return {sunsetted: false, recommended_action: 'no_action'};
        };

        await SwarmHeartbeatService.pulse();

        expect(sunsetChecks).toEqual(['@test', '@neo-opus-4-7', '@neo-gpt']);
    });

    test('pulse() with default targetSource=self pulses only primary identity', async () => {
        applyDefaultStubs();
        // No targetSource explicitly set → resolver default ('self'). Even if WAKE_SUBSCRIPTION
        // data is present, the lane only pulses the primary identity. External forks see
        // identical safe behavior by default.
        SwarmHeartbeatService.getWakeSubscriptionIdentities = async () => ['@neo-opus-4-7', '@neo-gpt'];

        const sunsetChecks = [];
        SwarmHeartbeatService.checkSunsetted = async (identity) => {
            sunsetChecks.push(identity);
            return {sunsetted: false, recommended_action: 'no_action'};
        };

        await SwarmHeartbeatService.pulse();

        expect(sunsetChecks).toEqual(['@test']);
    });

    test('pulse() with targetSource=disabled skips all per-identity work', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.targetSource = 'disabled';
        SwarmHeartbeatService.getWakeSubscriptionIdentities = async () => ['@neo-opus-4-7'];

        const sunsetChecks = [];
        SwarmHeartbeatService.checkSunsetted = async (identity) => {
            sunsetChecks.push(identity);
            return {sunsetted: false, recommended_action: 'no_action'};
        };

        await SwarmHeartbeatService.pulse();

        // Zero per-identity iterations; substrate maintenance (sweep, all-agent-idle) still ran.
        expect(sunsetChecks).toEqual([]);
    });

    test('pulse() with explicitTargets bypasses targetSource', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.targetSource    = 'disabled';                // would normally skip all
        SwarmHeartbeatService.explicitTargets = ['@ext-a', 'ext-b'];        // wins; 'ext-b' normalizes

        const sunsetChecks = [];
        SwarmHeartbeatService.checkSunsetted = async (identity) => {
            sunsetChecks.push(identity);
            return {sunsetted: false, recommended_action: 'no_action'};
        };

        await SwarmHeartbeatService.pulse();

        expect(sunsetChecks).toEqual(['@ext-a', '@ext-b']);
    });

    test('beforeSetTargetSource coerces invalid values to null', async () => {
        SwarmHeartbeatService.targetSource = 'self';
        expect(SwarmHeartbeatService.targetSource).toBe('self');

        SwarmHeartbeatService.targetSource = 'bogus-source';
        expect(SwarmHeartbeatService.targetSource).toBeNull();

        SwarmHeartbeatService.targetSource = '';
        expect(SwarmHeartbeatService.targetSource).toBeNull();

        SwarmHeartbeatService.targetSource = 'active-local-team';
        expect(SwarmHeartbeatService.targetSource).toBe('active-local-team');
    });

    test('beforeSetExplicitTargets normalizes + coerces empty to null', async () => {
        SwarmHeartbeatService.explicitTargets = ['neo-opus-4-7', '@neo-gpt'];
        expect(SwarmHeartbeatService.explicitTargets).toEqual(['@neo-opus-4-7', '@neo-gpt']);

        SwarmHeartbeatService.explicitTargets = [];
        expect(SwarmHeartbeatService.explicitTargets).toBeNull();

        SwarmHeartbeatService.explicitTargets = null;
        expect(SwarmHeartbeatService.explicitTargets).toBeNull();

        SwarmHeartbeatService.explicitTargets = 'not-an-array';
        expect(SwarmHeartbeatService.explicitTargets).toBeNull();
    });

    test('getWakeSubscriptionIdentities() normalizes active subscription identities and filters disabled routes (#11872)', async () => {
        applyDefaultStubs();

        SwarmHeartbeatService.getGraphDb = () => {
            return {
                prepare: () => ({
                    all: () => [
                        {identity: 'neo-gpt'},
                        {identity: '@neo-opus-4-7'},
                        {identity: null}
                    ]
                })
            }
        };

        const serviceProto = Object.getPrototypeOf(SwarmHeartbeatService);

        await expect(serviceProto.getWakeSubscriptionIdentities.call(SwarmHeartbeatService)).resolves.toEqual([
            '@neo-gpt',
            '@neo-opus-4-7'
        ]);
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

    test('isPushCapable() treats bridge-daemon as push-capable so Codex does not fall through to tmux (#11872)', async () => {
        applyDefaultStubs();

        const capturedArgs = [];
        SwarmHeartbeatService.getGraphDb = () => {
            return {
                prepare: () => {
                    return {
                        get: (...args) => {
                            capturedArgs.push(args);
                            return {count: 1}
                        }
                    }
                }
            }
        };

        const serviceProto = Object.getPrototypeOf(SwarmHeartbeatService);

        await expect(serviceProto.isPushCapable.call(SwarmHeartbeatService, '@neo-gpt')).resolves.toBe(true);
        expect(capturedArgs[0]).toEqual(['@neo-gpt', 'mcp-notifications', 'a2a-webhook', 'bridge-daemon']);
    });

    test('heartbeatAlivePath() defaults to the repo-root path HealthService reads (#11872)', async () => {
        const original = process.env.NEO_HEARTBEAT_ALIVE_PATH;
        delete process.env.NEO_HEARTBEAT_ALIVE_PATH;

        try {
            expect(heartbeatAlivePath()).toBe(path.resolve(process.cwd(), '.neo-ai-data/wake-daemon/heartbeat.alive'));

            const overridePath = path.join(os.tmpdir(), `neo-heartbeat-override-${Date.now()}.alive`);
            process.env.NEO_HEARTBEAT_ALIVE_PATH = overridePath;
            expect(heartbeatAlivePath()).toBe(overridePath);
        } finally {
            if (original === undefined) delete process.env.NEO_HEARTBEAT_ALIVE_PATH;
            else                        process.env.NEO_HEARTBEAT_ALIVE_PATH = original;
        }
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
