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
// longer imports Neo itself (the class+wrapper split pattern). Mirrors the test-spec
// bootstrap pattern in TaskStateService.spec / ProcessSupervisorService.spec.
import Neo       from '../../../../../../../src/Neo.mjs';
import * as core from '../../../../../../../src/core/_export.mjs';
import AiConfig  from '../../../../../../../ai/config.mjs';

import {test, expect} from '@playwright/test';

/**
 * @summary Unit coverage for `ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs`.
 *
 * Covers: `beforeSetIdentity` normalization + null-on-empty fork-safety,
 * concurrency-lock skip-vs-clear, sunset-detection-routes-to-resumeHarness, gate-tripped
 * blocks high-authority dispatch, idle-out-nudge routing, push-capable bypass,
 * sweep-failure isolation within `pulse()`.
 *
 * After the core.Base contract restoration: `initAsync()` is identity-agnostic
 * (peer-service `.ready()` calls only — no `process.env` reads, no `isInitialized`
 * band-aid, no manual idempotency guard). The framework triggers it ONCE during
 * singleton creation; external callers MUST use `await service.ready()` to wait for
 * completion. Identity / pollIntervalMs are pulse-time runtime config set by the
 * parent (Orchestrator) before `await service.ready()` in `start()` (the
 * framework already fired identity-agnostic
 * `initAsync()` at module-load, so the BEFORE-`.ready()` ordering matches the
 * `Orchestrator.start()` code); tests assign them directly via property write
 * post-fixture-setup to exercise `beforeSetIdentity` normalization without
 * needing the Orchestrator wire-up dance.
 *
 * The class is a lane folded into the Orchestrator: the Orchestrator owns the
 * scheduler. There is no self-rescheduling loop, no `start()`/`stop()`/`scheduleNext()`;
 * `initAsync()` runs once and `pulse()` runs once per Orchestrator cadence tick. The
 * Orchestrator's lane executor provides per-pulse failure isolation — `pulse()` itself
 * has no try/finally.
 *
 * Stubbing strategy: SwarmHeartbeatService exposes test-stubbable instance-method seams
 * (`checkHeartbeatLock`, `clearHeartbeatLock`, `sweepExpiredTasks`, `checkGateOpen`,
 * `readGate`, `checkSunsetted`, `resumeHarness`, `idleOutNudge`, `checkAllAgentIdle`,
 * `swarmWakeCooldown`, `runScript`, `runScriptJson`, `runCmd`, `getUnreadCount`,
 * `getIssuesCount`, `isPushCapable`, `getRecentActivityTimestamps`,
 * `getReadinessSentinelMessages`, `getActiveBackoffWindow`) precisely so unit tests can
 * override them without going through the heavy substrate. Module-binding imports (e.g.
 * `isGateOpen`) cannot be reassigned at import-site in ES modules — instance methods
 * are the seam that works.
 *
 * Each test stubs only what it needs; `afterEach` resets identity/pollIntervalMs to
 * baselines so cases don't bleed.
 */
test.describe('Neo.ai.daemons.SwarmHeartbeatService', () => {
    let SwarmHeartbeatService;
    let WakeSubscriptionService;
    let originalEmitHeartbeatPulse;
    let heartbeatAlivePath;
    let githubNotificationWakeStatePath;
    let isGitHubRemoteUrl;
    let extractPullRequestNumberFromNotificationUrl;
    let GraphService;
    let originalLifecycleInit;
    let originalGraphServiceInit;
    let MailboxService;
    let originalListMessages;
    let RequestContextService;

    test.beforeAll(async () => {
        const swarmHeartbeatModule = await import('../../../../../../../ai/daemons/orchestrator/services/SwarmHeartbeatService.mjs');
        SwarmHeartbeatService            = swarmHeartbeatModule.default;
        heartbeatAlivePath               = swarmHeartbeatModule.heartbeatAlivePath;
        githubNotificationWakeStatePath  = swarmHeartbeatModule.githubNotificationWakeStatePath;
        isGitHubRemoteUrl                = swarmHeartbeatModule.isGitHubRemoteUrl;
        extractPullRequestNumberFromNotificationUrl = swarmHeartbeatModule.extractPullRequestNumberFromNotificationUrl;

        const wakeSubscriptionModule = await import('../../../../../../../ai/services/memory-core/WakeSubscriptionService.mjs');
        WakeSubscriptionService      = wakeSubscriptionModule.default;
        originalEmitHeartbeatPulse   = WakeSubscriptionService.emitHeartbeatPulse;

        const mailboxModule    = await import('../../../../../../../ai/services/memory-core/MailboxService.mjs');
        MailboxService         = mailboxModule.default;
        originalListMessages   = MailboxService.listMessages;

        const contextModule    = await import('../../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs');
        RequestContextService  = contextModule.default;

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
        if (originalEmitHeartbeatPulse) {
            WakeSubscriptionService.emitHeartbeatPulse = originalEmitHeartbeatPulse;
        }
        if (originalListMessages) {
            MailboxService.listMessages = originalListMessages;
        }
    });

    /**
     * Apply a default no-op stub set so every test starts from a deterministic baseline.
     * Individual tests override the seams they care about.
     *
     * After the core.Base contract restoration: `identity` assignment exercises `beforeSetIdentity` normalization;
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
        SwarmHeartbeatService.swarmWakeCooldown  = async () => {};
        SwarmHeartbeatService.emitGitHubNotificationWakes = async () => {};
        delete SwarmHeartbeatService._volatileGitHubNotificationSeenIds;
        SwarmHeartbeatService.getWakeSubscriptionIdentities = async () => [];
        SwarmHeartbeatService.runScriptJson      = async () => null;
        SwarmHeartbeatService.runScript          = async () => '';
        SwarmHeartbeatService.runCmd             = async () => '[]';
        delete SwarmHeartbeatService.getGraphDb;
        SwarmHeartbeatService.getUnreadCount     = async () => 0;
        SwarmHeartbeatService.getIssuesCount     = async () => 0;
        SwarmHeartbeatService.isPushCapable      = async () => false;
        // Sub-iii 3-signal-emit-loop seams — default to no-wake by returning
        // empty activity (decideWake returns 'no-active-signal' → no emit fires).
        SwarmHeartbeatService.getRecentActivityTimestamps  = async () => [];
        SwarmHeartbeatService.getReadinessSentinelMessages = async () => [];
        SwarmHeartbeatService.getActiveBackoffWindow       = () => null;
        WakeSubscriptionService.emitHeartbeatPulse         = async () => ({status: 'emitted'});
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
        delete SwarmHeartbeatService._volatileGitHubNotificationSeenIds;
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

    test('getResumeHarnessTargetMetadata prefers addressed active bridge route (#12536)', async () => {
        applyDefaultStubs();
        const originalList = WakeSubscriptionService.list;
        WakeSubscriptionService.list = async () => ({
            subscriptions: [{
                id                   : 'WAKE_SUB:generic',
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                updatedAt            : '2026-06-06T22:00:00.000Z',
                harnessTargetMetadata: {
                    appName    : 'Claude',
                    tabShortcut: '3'
                }
            }, {
                id                   : 'WAKE_SUB:addressed',
                trigger              : 'SENT_TO_ME',
                harnessTarget        : 'bridge-daemon',
                status               : 'active',
                updatedAt            : '2026-06-06T21:00:00.000Z',
                harnessTargetMetadata: {
                    appName        : 'Claude',
                    tabShortcut    : '3',
                    instanceAddress: '/Users/example/.claude-instances/neo-opus-vega',
                    addressType    : 'userDataDir'
                }
            }]
        });

        try {
            await expect(SwarmHeartbeatService.getResumeHarnessTargetMetadata('@neo-opus-vega')).resolves.toMatchObject({
                appName        : 'Claude',
                instanceAddress: '/Users/example/.claude-instances/neo-opus-vega',
                addressType    : 'userDataDir'
            });
        } finally {
            WakeSubscriptionService.list = originalList;
        }
    });

    test('resumeHarness fails closed when route metadata lookup fails (#12536)', async () => {
        applyDefaultStubs();
        const originalGetMetadata = SwarmHeartbeatService.getResumeHarnessTargetMetadata;
        SwarmHeartbeatService.getResumeHarnessTargetMetadata = async () => {
            throw new Error('simulated route lookup failure')
        };

        try {
            await expect(SwarmHeartbeatService.resumeHarness(
                '@neo-opus-ada',
                'sunset_restart',
                'sid-route-failure',
                0
            )).resolves.toBeUndefined();
        } finally {
            SwarmHeartbeatService.getResumeHarnessTargetMetadata = originalGetMetadata;
        }
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

        SwarmHeartbeatService.targetSource = 'active-a2a-participants';
        expect(SwarmHeartbeatService.targetSource).toBe('active-a2a-participants');
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

    test('getActiveA2aParticipants() SQL covers SENT_TO + DELIVERED_TO + SENT_BY edge taxonomy, excludes AGENT:* sentinel, applies 3h cutoff (#12003 cycle-2)', async () => {
        applyDefaultStubs();

        // Capture both the SQL string and the parameters so the test asserts the
        // edge taxonomy (the resolver contract), not just the returned identity list.
        let capturedSql       = null;
        const capturedParams  = [];
        SwarmHeartbeatService.getGraphDb = () => {
            return {
                prepare: sql => {
                    capturedSql = sql;
                    return {
                        all: (...params) => {
                            capturedParams.push(params);
                            return [
                                {identity: 'neo-gpt'},          // SENT_TO recipient (direct DM)
                                {identity: '@neo-opus-4-7'},    // DELIVERED_TO recipient (broadcast fan-out)
                                {identity: null},
                                {identity: '@neo-gemini-3-1-pro'}, // SENT_BY sender
                                {identity: '@system'}              // lifecycle sender, excluded
                            ];
                        }
                    };
                }
            }
        };

        const serviceProto = Object.getPrototypeOf(SwarmHeartbeatService);
        const result       = await serviceProto.getActiveA2aParticipants.call(SwarmHeartbeatService);

        // SQL edge-taxonomy contract: all 3 edge classes covered.
        expect(capturedSql).toContain("e.type = 'SENT_TO'");
        expect(capturedSql).toContain("e.type = 'DELIVERED_TO'");
        expect(capturedSql).toContain("e.type = 'SENT_BY'");
        // SENT_TO branch explicitly excludes the AGENT:* broadcast sentinel — the
        // per-recipient DELIVERED_TO edges are the canonical broadcast targets.
        expect(capturedSql).toContain("e.target != 'AGENT:*'");
        // 3h cutoff applied via sentAt comparison.
        expect(capturedSql).toContain("json_extract(n.data, '$.properties.sentAt') >= ?");
        // MESSAGE label filter on all branches.
        expect(capturedSql).toContain("json_extract(n.data, '$.label') = 'MESSAGE'");

        // Identities normalized + null/system filtered; dedup via SELECT DISTINCT.
        expect(result).toEqual(['@neo-gpt', '@neo-opus-4-7', '@neo-gemini-3-1-pro']);

        // 3 cutoff params (one per UNION branch); identical (same Date.now() snapshot); ISO format.
        expect(capturedParams).toHaveLength(1);
        expect(capturedParams[0]).toHaveLength(3);
        for (const param of capturedParams[0]) {
            expect(param).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        }
        expect(capturedParams[0][0]).toBe(capturedParams[0][1]);
        expect(capturedParams[0][1]).toBe(capturedParams[0][2]);
    });

    test('getActiveA2aParticipants() returns [] on query failure (substrate-error fallback)', async () => {
        applyDefaultStubs();

        SwarmHeartbeatService.getGraphDb = () => {
            return {
                prepare: () => {
                    throw new Error('simulated graph DB unavailability');
                }
            }
        };

        const serviceProto = Object.getPrototypeOf(SwarmHeartbeatService);
        await expect(serviceProto.getActiveA2aParticipants.call(SwarmHeartbeatService)).resolves.toEqual([]);
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

    test('pulse() routes allIdle to swarmWakeCooldown when gate is open', async () => {
        applyDefaultStubs();
        const swarmCalls = [];
        SwarmHeartbeatService.checkAllAgentIdle = async () => ({allIdle: true, cycle_id: '1', identities: ['@a', '@b']});
        SwarmHeartbeatService.swarmWakeCooldown = async (signal) => { swarmCalls.push(signal) };

        await SwarmHeartbeatService.pulse();

        expect(swarmCalls.length).toBe(1);
        expect(swarmCalls[0].allIdle).toBe(true);
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

    test('pulse() isolates a sweep failure locally and continues to later steps (#11996 cycle-3 shape)', async () => {
        applyDefaultStubs();
        SwarmHeartbeatService.sweepExpiredTasks            = async () => { throw new Error('substrate down') };
        SwarmHeartbeatService.getRecentActivityTimestamps  = async () => [Date.now() - 30 * 60 * 1000]; // active+idle
        SwarmHeartbeatService.getReadinessSentinelMessages = async () => [];
        SwarmHeartbeatService.getActiveBackoffWindow       = () => null;

        const emitted = [];
        WakeSubscriptionService.emitHeartbeatPulse = async ({targetIdentity}) => { emitted.push(targetIdentity); return {status: 'emitted'} };

        // Sweep throws but is caught by the inner try/catch around the sweep step;
        // pulse() does not propagate the error and proceeds to the 3-signal emit loop.
        await expect(SwarmHeartbeatService.pulse()).resolves.toBeUndefined();
        expect(emitted.length).toBeGreaterThan(0);
    });

    test('pulse() 3-signal emit loop calls emitHeartbeatPulse iff decideWake returns wake:true (#11996 AC2)', async () => {
        applyDefaultStubs();

        // Identity has activity 30min ago → active + idle (not within 15m idle window)
        SwarmHeartbeatService.getRecentActivityTimestamps  = async () => [Date.now() - 30 * 60 * 1000];
        SwarmHeartbeatService.getReadinessSentinelMessages = async () => [];
        SwarmHeartbeatService.getActiveBackoffWindow       = () => null;

        const emitted = [];
        WakeSubscriptionService.emitHeartbeatPulse = async ({targetIdentity}) => { emitted.push(targetIdentity); return {status: 'emitted'} };

        await SwarmHeartbeatService.pulse();
        // Default pulseIdentities = [this.identity]; the loop should emit once for active+idle+ready.
        expect(emitted.length).toBe(1);
    });

    test('pulse() 3-signal emit loop skips emit when readiness sentinel blocks (#11996 AC2)', async () => {
        applyDefaultStubs();

        SwarmHeartbeatService.getRecentActivityTimestamps  = async () => [Date.now() - 30 * 60 * 1000]; // active+idle
        // Active blocking sentinel (ready:false, future expiresAt)
        SwarmHeartbeatService.getReadinessSentinelMessages = async () => [{
            id        : 'msg-block',
            properties: {task: {type: 'wake-readiness', ready: false, reason: 'benched', expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()}}
        }];
        SwarmHeartbeatService.getActiveBackoffWindow = () => null;

        const emitted = [];
        WakeSubscriptionService.emitHeartbeatPulse = async ({targetIdentity}) => { emitted.push(targetIdentity); return {status: 'emitted'} };

        await SwarmHeartbeatService.pulse();
        expect(emitted.length).toBe(0);
    });

    test('pulse() 3-signal emit loop skips emit when backoff window active (#11996 AC2)', async () => {
        applyDefaultStubs();

        SwarmHeartbeatService.getRecentActivityTimestamps  = async () => [Date.now() - 30 * 60 * 1000]; // active+idle
        SwarmHeartbeatService.getReadinessSentinelMessages = async () => [];
        SwarmHeartbeatService.getActiveBackoffWindow       = () => ({expiresAtMs: Date.now() + 30 * 60 * 1000, reason: 'error-streak-3'});

        const emitted = [];
        WakeSubscriptionService.emitHeartbeatPulse = async ({targetIdentity}) => { emitted.push(targetIdentity); return {status: 'emitted'} };

        await SwarmHeartbeatService.pulse();
        expect(emitted.length).toBe(0);
    });

    test('getRecentActivityTimestamps binds RequestContextService identity before MailboxService.listMessages call (PR #11999 cycle-2)', async () => {
        // MailboxService.listMessages() reads RequestContextService.getAgentIdentityNodeId()
        // at entry and throws "Cannot list messages: no agent identity context bound." when
        // unbound. Sub-iii's helper MUST wrap the calls in RequestContextService.run({...})
        // so the production heartbeat loop sees real activity timestamps instead of silently
        // catching the throw and returning [].
        applyDefaultStubs();
        // Restore the REAL helper (override the applyDefaultStubs stub).
        delete SwarmHeartbeatService.getRecentActivityTimestamps;

        const seenContextIdentities = [];
        MailboxService.listMessages = async ({box, fromIdentity, to}) => {
            const boundIdentity = RequestContextService.getAgentIdentityNodeId();
            seenContextIdentities.push({box, fromIdentity, to, boundIdentity});
            return {messages: [{messageId: `${box}-msg`, sentAt: new Date(Date.now() - 30 * 60 * 1000).toISOString()}]};
        };

        const targetIdentity = '@neo-context-test';
        const now            = Date.now();
        const result         = await SwarmHeartbeatService.getRecentActivityTimestamps(targetIdentity, now);

        try {
            // Each MailboxService.listMessages call must have seen the bound identity.
            expect(seenContextIdentities.length).toBeGreaterThan(0);
            for (const call of seenContextIdentities) {
                expect(call.boundIdentity).toBe(targetIdentity);
            }
            // Result must include parsed timestamps (proves the wrapper returned real data,
            // not the catch-fallback []).
            expect(result.length).toBeGreaterThan(0);
            expect(result.every(ts => Number.isFinite(ts))).toBe(true);
        } finally {
            MailboxService.listMessages = originalListMessages;
        }
    });

    test('getReadinessSentinelMessages binds RequestContextService identity AND returns listMessages summaries that decideWake honors (PR #11999 cycle-2)', async () => {
        // Two-part contract:
        // 1. The helper wraps MailboxService.listMessages in RequestContextService.run.
        // 2. The summary shape returned ({messageId, task, ...}) is consumed by
        //    WakeDecisionService.parseActiveReadinessSentinels and the resulting
        //    `active: false` propagates through decideWake → blocks the wake.
        applyDefaultStubs();
        delete SwarmHeartbeatService.getReadinessSentinelMessages;

        const wakeDecisionModule = await import('../../../../../../../ai/daemons/orchestrator/services/WakeDecisionService.mjs');
        const {WakeDecisionService} = wakeDecisionModule;

        const targetIdentity     = '@neo-context-test';
        const now                = Date.now();
        const seenContext        = [];
        const blockingSentinelTs = new Date(now + 60 * 60 * 1000).toISOString();
        MailboxService.listMessages = async ({to, taggedConcepts}) => {
            seenContext.push({to, taggedConcepts, boundIdentity: RequestContextService.getAgentIdentityNodeId()});
            return {
                messages: [{
                    messageId: 'MESSAGE:real-listmessages-summary',
                    task     : {type: 'wake-readiness', ready: false, reason: 'rate-limit', expiresAt: blockingSentinelTs},
                    sentAt   : new Date(now - 60_000).toISOString()
                }]
            };
        };

        try {
            const sentinelMessages       = await SwarmHeartbeatService.getReadinessSentinelMessages(targetIdentity);
            const activeReadinessSentinel = WakeDecisionService.parseActiveReadinessSentinels(sentinelMessages, now);

            // Part 1: Context-binding contract.
            expect(seenContext.length).toBe(1);
            expect(seenContext[0].to).toBe(targetIdentity);
            expect(seenContext[0].taggedConcepts).toEqual(['wake-readiness']);
            expect(seenContext[0].boundIdentity).toBe(targetIdentity);

            // Part 2: Summary-shape adapter contract — parser accepts {messageId, task}.
            expect(activeReadinessSentinel).not.toBeNull();
            expect(activeReadinessSentinel.ready).toBe(false);
            expect(activeReadinessSentinel.reason).toBe('rate-limit');
            expect(activeReadinessSentinel.sourceMessageId).toBe('MESSAGE:real-listmessages-summary');

            // Composition: feeding into decideWake produces wake:false (blocked).
            const decision = WakeDecisionService.decideWake({
                identity                : targetIdentity,
                currentTimeMs           : now,
                recentActivityTimestamps: [now - 30 * 60 * 1000],
                activeReadinessSentinel
            });
            expect(decision.wake).toBe(false);
            expect(decision.signals.ready).toBe(false);
        } finally {
            MailboxService.listMessages = originalListMessages;
        }
    });

    test('injectTmux method removed entirely (#11996 AC1)', async () => {
        // Per the cycle-3 + Sub-iii AC1 design: tmux-inject is dead-path substrate
        // for non-tmux harnesses (Codex Desktop case); deleted entirely.
        // wake-daemon's tmux adapter is the canonical tmux delivery path.
        expect(SwarmHeartbeatService.injectTmux).toBeUndefined();
        const serviceProto = Object.getPrototypeOf(SwarmHeartbeatService);
        expect(serviceProto.injectTmux).toBeUndefined();
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

    test('isGitHubRemoteUrl gates GitHub remotes without Neo-team coupling (#12937)', async () => {
        expect(isGitHubRemoteUrl('git@github.com:some-org/some-repo.git')).toBe(true);
        expect(isGitHubRemoteUrl('https://github.com/some-org/some-repo.git')).toBe(true);
        expect(isGitHubRemoteUrl('git@gitlab.com:some-org/some-repo.git')).toBe(false);
        expect(isGitHubRemoteUrl('/Users/example/local-repo')).toBe(false);
        expect(isGitHubRemoteUrl('')).toBe(false);
    });

    test('#13411 GitHub notification enrichment carries live PR state and degrades safe', async () => {
        applyDefaultStubs();
        const serviceProto = Object.getPrototypeOf(SwarmHeartbeatService);

        expect(extractPullRequestNumberFromNotificationUrl('https://api.github.com/repos/acme/repo/pulls/13411')).toBe(13411);
        expect(extractPullRequestNumberFromNotificationUrl('https://api.github.com/repos/acme/repo/issues/13411')).toBe(13411);
        expect(extractPullRequestNumberFromNotificationUrl('https://api.github.com/repos/acme/repo')).toBeNull();

        SwarmHeartbeatService.resolvePullRequestState = async (number) => {
            if (number === 13411) return { number, state: 'OPEN', mergedAt: null, checkedAt: '2026-06-16T10:19:00Z' };
            if (number === 13412) return { number, state: 'MERGED', mergedAt: '2026-06-16T10:20:00Z', checkedAt: '2026-06-16T10:21:00Z' };
            return null
        };

        const enriched = await serviceProto.enrichGitHubNotificationsWithPullRequestState.call(SwarmHeartbeatService, [{
            id    : 'ghn-open',
            reason: 'mention',
            type  : 'PullRequest',
            title : 'Open PR',
            url   : 'https://api.github.com/repos/acme/repo/pulls/13411'
        }, {
            id    : 'ghn-merged',
            reason: 'review_requested',
            type  : 'PullRequest',
            title : 'Merged PR',
            url   : 'https://api.github.com/repos/acme/repo/pulls/13412'
        }, {
            id    : 'ghn-fail',
            reason: 'mention',
            type  : 'PullRequest',
            title : 'Fetch fails',
            url   : 'https://api.github.com/repos/acme/repo/pulls/13413'
        }, {
            id    : 'ghn-issue',
            reason: 'mention',
            type  : 'Issue',
            title : 'Issue mention',
            url   : 'https://api.github.com/repos/acme/repo/issues/13414'
        }]);

        expect(enriched[0].pullRequest).toEqual({ number: 13411, state: 'OPEN', mergedAt: null, checkedAt: '2026-06-16T10:19:00Z' });
        expect(enriched[1].pullRequest).toEqual({ number: 13412, state: 'MERGED', mergedAt: '2026-06-16T10:20:00Z', checkedAt: '2026-06-16T10:21:00Z' });
        expect(enriched[2].pullRequest).toBeUndefined();
        expect(enriched[3].pullRequest).toBeUndefined();
    });

    test('getGitHubNotifications consumes the shared mention/review-request projection (#12937)', async () => {
        applyDefaultStubs();
        delete SwarmHeartbeatService.getGitHubNotifications;

        SwarmHeartbeatService.runCmd = async () => JSON.stringify([{
            id     : 'ghn-mention',
            reason : 'mention',
            subject: {type: 'Issue', title: 'Ping Euclid', url: 'https://api.github.com/repos/acme/repo/issues/1'}
        }, {
            id     : 'ghn-review',
            reason : 'review_requested',
            subject: {type: 'PullRequest', title: 'Review me', url: 'https://api.github.com/repos/acme/repo/pulls/2'}
        }, {
            id     : 'ghn-noise',
            reason : 'subscribed',
            subject: {type: 'Issue', title: 'Noise', url: 'https://api.github.com/repos/acme/repo/issues/3'}
        }]);

        const serviceProto = Object.getPrototypeOf(SwarmHeartbeatService);
        const result       = await serviceProto.getGitHubNotifications.call(SwarmHeartbeatService);

        expect(result).toEqual([{
            id    : 'ghn-mention',
            reason: 'mention',
            type  : 'Issue',
            title : 'Ping Euclid',
            url   : 'https://api.github.com/repos/acme/repo/issues/1'
        }, {
            id    : 'ghn-review',
            reason: 'review_requested',
            type  : 'PullRequest',
            title : 'Review me',
            url   : 'https://api.github.com/repos/acme/repo/pulls/2'
        }]);
    });

    test('emitGitHubNotificationWakes disables on non-GitHub remotes (#12937)', async () => {
        applyDefaultStubs();
        delete SwarmHeartbeatService.emitGitHubNotificationWakes;

        let fetched = false;
        const emitted = [];

        SwarmHeartbeatService.getGitRemoteUrl = async () => 'git@gitlab.com:acme/repo.git';
        SwarmHeartbeatService.getGitHubNotifications = async () => {
            fetched = true;
            return [{id: 'ghn-1', reason: 'mention'}]
        };
        WakeSubscriptionService.emitHeartbeatPulse = async ({targetIdentity}) => {
            emitted.push(targetIdentity);
            return {status: 'emitted'}
        };

        await SwarmHeartbeatService.emitGitHubNotificationWakes(['@test']);

        expect(fetched).toBe(false);
        expect(emitted).toEqual([]);
    });

    test('emitGitHubNotificationWakes emits once per unseen GitHub notification id (#12937)', async () => {
        applyDefaultStubs();
        delete SwarmHeartbeatService.emitGitHubNotificationWakes;

        let state = {};
        const emitted = [];

        SwarmHeartbeatService.getGitRemoteUrl = async () => 'https://github.com/acme/repo.git';
        SwarmHeartbeatService.getGitHubNotifications = async () => [{
            id    : 'ghn-1',
            reason: 'mention',
            title : 'Ping Euclid'
        }, {
            id         : 'ghn-2',
            reason     : 'review_requested',
            title      : 'Review request',
            pullRequest: {number: 13411, state: 'MERGED', mergedAt: '2026-06-16T10:20:00Z', checkedAt: '2026-06-16T10:21:00Z'}
        }];
        SwarmHeartbeatService.readGitHubNotificationWakeState  = async () => state;
        SwarmHeartbeatService.writeGitHubNotificationWakeState = async (nextState) => {
            state = JSON.parse(JSON.stringify(nextState))
        };
        WakeSubscriptionService.emitHeartbeatPulse = async ({targetIdentity, pulseId}) => {
            emitted.push({targetIdentity, pulseId});
            return {status: 'emitted', targetIdentity, pulseId, logId: emitted.length}
        };

        await SwarmHeartbeatService.emitGitHubNotificationWakes(['@test']);
        await SwarmHeartbeatService.emitGitHubNotificationWakes(['@test']);

        expect(emitted).toHaveLength(1);
        expect(emitted[0].targetIdentity).toBe('@test');
        expect(emitted[0].pulseId).toMatch(/^github-notification\./);
        const summary = JSON.parse(Buffer.from(emitted[0].pulseId.slice('github-notification.'.length), 'base64url').toString('utf8'));
        expect(summary).toMatchObject({
            source: 'github-notification',
            count : 2,
            latest: {
                id         : 'ghn-2',
                reason     : 'review_requested',
                title      : 'Review request',
                pullRequest: {number: 13411, state: 'MERGED', mergedAt: '2026-06-16T10:20:00Z', checkedAt: '2026-06-16T10:21:00Z'}
            }
        });
        expect(state['@test']).toEqual(['ghn-1', 'ghn-2']);
    });

    test('emitGitHubNotificationWakes leaves ids unconsumed when no wake route emits (#12937)', async () => {
        applyDefaultStubs();
        delete SwarmHeartbeatService.emitGitHubNotificationWakes;

        let state = {};

        SwarmHeartbeatService.getGitRemoteUrl = async () => 'git@github.com:acme/repo.git';
        SwarmHeartbeatService.getGitHubNotifications = async () => [{id: 'ghn-1', reason: 'mention'}];
        SwarmHeartbeatService.readGitHubNotificationWakeState  = async () => state;
        SwarmHeartbeatService.writeGitHubNotificationWakeState = async (nextState) => {
            state = JSON.parse(JSON.stringify(nextState))
        };
        WakeSubscriptionService.emitHeartbeatPulse = async ({targetIdentity}) => ({
            status: 'skipped',
            reason: 'no-active-bridge-daemon-subscription',
            targetIdentity
        });

        await SwarmHeartbeatService.emitGitHubNotificationWakes(['@test']);

        expect(state).toEqual({});
    });

    test('emitGitHubNotificationWakes keeps emitted ids volatile when wake-state persist fails (#12937)', async () => {
        applyDefaultStubs();
        delete SwarmHeartbeatService.emitGitHubNotificationWakes;

        const emitted = [];

        SwarmHeartbeatService.getGitRemoteUrl = async () => 'https://github.com/acme/repo.git';
        SwarmHeartbeatService.getGitHubNotifications = async () => [{id: 'ghn-1', reason: 'mention'}];
        SwarmHeartbeatService.readGitHubNotificationWakeState  = async () => ({});
        SwarmHeartbeatService.writeGitHubNotificationWakeState = async () => {
            throw new Error('simulated persist failure')
        };
        WakeSubscriptionService.emitHeartbeatPulse = async ({targetIdentity, pulseId}) => {
            emitted.push({targetIdentity, pulseId});
            return {status: 'emitted', targetIdentity, pulseId}
        };

        await expect(SwarmHeartbeatService.emitGitHubNotificationWakes(['@test'])).resolves.toBeUndefined();
        await expect(SwarmHeartbeatService.emitGitHubNotificationWakes(['@test'])).resolves.toBeUndefined();

        // First pulse is delivered, then the failed persist is retained in process
        // memory so a persistent fs failure cannot re-emit the same id every heartbeat.
        expect(emitted).toHaveLength(1);
        expect(emitted[0].targetIdentity).toBe('@test');
    });

    test('heartbeatAlivePath() reads AiConfig.wakeDaemonHeartbeatAlivePath verbatim (#11872)', async () => {
        const original = AiConfig.wakeDaemonHeartbeatAlivePath;

        try {
            // Per the SSOT contract, env precedence is owned by `envBindings.wakeDaemonHeartbeatAlivePath
            // → NEO_HEARTBEAT_ALIVE_PATH` at config-load time. The service reads the resolved value
            // directly; tests simulate env-applied state by mutating AiConfig.
            expect(heartbeatAlivePath()).toBe(AiConfig.wakeDaemonHeartbeatAlivePath);

            const overridePath = path.join(os.tmpdir(), `neo-heartbeat-override-${Date.now()}.alive`);
            AiConfig.wakeDaemonHeartbeatAlivePath = overridePath;
            expect(heartbeatAlivePath()).toBe(overridePath);
        } finally {
            AiConfig.wakeDaemonHeartbeatAlivePath = original;
        }
    });

    test('GitHub notification wake-state lives beside the heartbeat liveness file (#12937)', async () => {
        const original = AiConfig.wakeDaemonHeartbeatAlivePath;
        const tmpDir   = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-github-notification-state-'));

        try {
            AiConfig.wakeDaemonHeartbeatAlivePath = path.join(tmpDir, 'heartbeat.alive');
            expect(githubNotificationWakeStatePath()).toBe(path.join(tmpDir, 'github-notification-wake-ids.json'));

            applyDefaultStubs();
            delete SwarmHeartbeatService.readGitHubNotificationWakeState;
            delete SwarmHeartbeatService.writeGitHubNotificationWakeState;

            const serviceProto = Object.getPrototypeOf(SwarmHeartbeatService);
            await serviceProto.writeGitHubNotificationWakeState.call(SwarmHeartbeatService, {'@test': ['ghn-1']});

            await expect(serviceProto.readGitHubNotificationWakeState.call(SwarmHeartbeatService)).resolves.toEqual({
                '@test': ['ghn-1']
            });
        } finally {
            AiConfig.wakeDaemonHeartbeatAlivePath = original;
            await fs.rm(tmpDir, {recursive: true, force: true});
        }
    });

    // (Removed in cycle-3 cleanup) test 'pulse() includes expired-count in prompt when sweep yields > 0'
    // tested the old Step 7 tmux-inject prompt formatting. After Sub-iii, the
    // 3-signal-emit loop carries no per-pulse prompt content (wake-daemon's digest
    // line reads "N heartbeat pulses" — see ai/daemons/wake/daemon.mjs:572). The
    // expired-task COUNT is still logged at Step 2 for diagnostics; no need to assert
    // it in the wake-event payload.

    test('pulse() touches the heartbeat-liveness file HealthService reads (#11766)', async () => {
        applyDefaultStubs();
        // Un-stub touchLivenessFile so the real producer runs against an isolated path.
        delete SwarmHeartbeatService.touchLivenessFile;

        const alivePath = path.join(os.tmpdir(), `neo-heartbeat-alive-${Date.now()}.alive`);
        const original  = AiConfig.wakeDaemonHeartbeatAlivePath;
        AiConfig.wakeDaemonHeartbeatAlivePath = alivePath;

        try {
            const before = Date.now();
            await SwarmHeartbeatService.pulse();

            // The liveness file now exists with a fresh mtime — the producer side of the
            // `HealthService.daemonRunning` contract restored after the Orchestrator fold.
            const stat = await fs.stat(alivePath);
            expect(stat.mtime.getTime()).toBeGreaterThanOrEqual(before - 1000);
        } finally {
            AiConfig.wakeDaemonHeartbeatAlivePath = original;
            await fs.rm(alivePath, {force: true});
        }
    });
});
