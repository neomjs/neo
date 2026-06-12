import {setup} from '../../../../setup.mjs';

const appName = 'KbAlertingServiceTest';

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
// the dynamic KbAlertingService import below. Required because the class file no longer
// imports Neo itself (class+wrapper split). Mirrors SwarmHeartbeatService.spec.
import Neo       from '../../../../../../src/Neo.mjs';
import * as core from '../../../../../../src/core/_export.mjs';

import {test, expect} from '@playwright/test';

/**
 * Unit coverage for `ai/daemons/kb-alerting/KbAlertingService.mjs`, the KB
 * operator-alerting daemon.
 *
 * Stubbing strategy mirrors `SwarmHeartbeatService.spec.mjs`: the daemon exposes
 * test-stubbable instance-method seams (`getKbConfig`, `fetchRollup`, `dispatchAlert`,
 * `dispatchConsole`, `dispatchA2A`, `scheduleNext`) so tests override them on the
 * singleton without going through real config / SQLite / Memory Core I/O. External
 * singletons (`MailboxService.addMessage`, `RequestContextService.run`, `logger`) are
 * saved + restored around each test for the `dispatchA2A` / `dispatchConsole` cases.
 *
 * Covers the Contract Ledger Evidence columns for channel dispatch (direct-DM,
 * explicit broadcast, invalid-target rejection, wake vs. audit) and the daemon poll loop;
 * the pure threshold/cooldown logic is covered separately in `KbAlertRuleEngine.spec.mjs`.
 *
 * @see https://github.com/neomjs/neo/issues/11642
 * @see ai/daemons/kb-alerting/KbAlertingService.mjs — the daemon under test.
 * @see test/playwright/unit/ai/daemons/SwarmHeartbeatService.spec.mjs — the sibling pattern.
 */
test.describe('Neo.ai.daemons.KbAlertingService (#11642)', () => {
    let KbAlertingService;
    let MailboxService, RequestContextService, logger;
    let originals = {};

    /** A breaching rule fixture — console + direct-DM A2A channels. */
    const RULE = {metric: 'errorRate', threshold: 0.1, severity: 'warning', channels: ['console', 'a2a:@neo-gpt']};

    /** A one-tenant rollup whose errorRate (0.3) breaches RULE's 0.1 threshold. */
    const ROLLUP = [{tenantId: 'tenant-x', repoSlug: 'repo-x', eventCount: 10, errorEvents: 3, errorRate: 0.3}];

    /** Resolved AiConfig subtree fixture — mirrors Provider-inherited template leaves. */
    const defaultConfig = () => ({
        alertingEnabled   : true,
        alertRules        : [RULE],
        alertingIntervalMs: 15 * 60 * 1000,
        alertWindowMs     : 60 * 60 * 1000,
        alertingCooldownMs: 60 * 60 * 1000
    });

    test.beforeAll(async () => {
        ({default: KbAlertingService} =
            await import('../../../../../../ai/daemons/kb-alerting/KbAlertingService.mjs'));

        MailboxService        = (await import('../../../../../../ai/services/memory-core/MailboxService.mjs')).default;
        RequestContextService = (await import('../../../../../../ai/mcp/server/shared/services/RequestContextService.mjs')).default;
        logger                = (await import('../../../../../../ai/mcp/server/knowledge-base/logger.mjs')).default;

        const KBRecorderService = (await import('../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;

        originals = {
            addMessage      : MailboxService.addMessage,
            isReachableTarget: MailboxService.isReachableTarget,
            run             : RequestContextService.run,
            warn            : logger.warn,
            error           : logger.error,
            recorderReady   : KBRecorderService.ready,
            neoAgentIdentity: process.env.NEO_AGENT_IDENTITY
        };

        // `start()` awaits KBRecorderService.ready() — stub it to resolve immediately.
        KBRecorderService.ready = async () => {};
    });

    test.afterAll(async () => {
        const KBRecorderService = (await import('../../../../../../ai/services/knowledge-base/KBRecorderService.mjs')).default;
        KBRecorderService.ready = originals.recorderReady;
    });

    test.afterEach(() => {
        KbAlertingService.stop();
        KbAlertingService.isPolling      = false;
        KbAlertingService.pollIntervalMs = null;
        KbAlertingService.cooldownState  = {};

        // Drop instance-method seam overrides so the real prototype methods resurface for
        // the next test — an instance override otherwise leaks across tests in the worker.
        for (const seam of ['getKbConfig', 'fetchRollup', 'dispatchAlert', 'dispatchConsole', 'dispatchA2A', 'scheduleNext']) {
            delete KbAlertingService[seam];
        }

        MailboxService.addMessage        = originals.addMessage;
        MailboxService.isReachableTarget = originals.isReachableTarget;
        RequestContextService.run        = originals.run;
        logger.warn                      = originals.warn;
        logger.error                     = originals.error;

        if (originals.neoAgentIdentity === undefined) {
            delete process.env.NEO_AGENT_IDENTITY
        } else {
            process.env.NEO_AGENT_IDENTITY = originals.neoAgentIdentity
        }
    });

    /**
     * Deterministic seam baseline — every test starts here, then overrides what it needs.
     * `scheduleNext` is neutralized so tests never leave a real timer in the event loop.
     */
    function applyStubs({config, rollup} = {}) {
        KbAlertingService.getKbConfig  = () => config ?? defaultConfig();
        KbAlertingService.fetchRollup  = async () => rollup || ROLLUP;
        KbAlertingService.scheduleNext = function () {};
    }

    test.describe('start / stop', () => {
        test('start() is a no-op when alertingEnabled is false', async () => {
            applyStubs({config: {...defaultConfig(), alertingEnabled: false}});
            let scheduled = 0;
            KbAlertingService.scheduleNext = () => { scheduled++ };

            await KbAlertingService.start();

            expect(KbAlertingService.isPolling).toBe(false);
            expect(scheduled).toBe(0);
        });

        test('start() schedules when enabled and is idempotent', async () => {
            applyStubs();
            let scheduled = 0;
            KbAlertingService.scheduleNext = () => { scheduled++ };

            await KbAlertingService.start();
            expect(KbAlertingService.isPolling).toBe(true);
            expect(scheduled).toBe(1);

            await KbAlertingService.start();
            expect(scheduled).toBe(1); // second start() is a no-op
        });

        test('start() honors a configured alertingIntervalMs', async () => {
            applyStubs({config: {...defaultConfig(), alertingIntervalMs: 12345}});

            await KbAlertingService.start();

            expect(KbAlertingService.pollIntervalMs).toBe(12345);
        });

        test('start() resets cooldown state', async () => {
            applyStubs();
            KbAlertingService.cooldownState = {'stale|key|warning|console': 1};

            await KbAlertingService.start();

            expect(KbAlertingService.cooldownState).toEqual({});
        });

        test('stop() clears the poll handle and is idempotent', async () => {
            applyStubs();
            KbAlertingService.scheduleNext = function () { this.pollHandle = setTimeout(() => {}, 60_000) };

            await KbAlertingService.start();
            expect(KbAlertingService.pollHandle).not.toBeNull();

            KbAlertingService.stop();
            expect(KbAlertingService.pollHandle).toBeNull();
            expect(KbAlertingService.isPolling).toBe(false);
            expect(() => KbAlertingService.stop()).not.toThrow();
        });
    });

    test.describe('pulse', () => {
        test('dispatches nothing when no rules are configured', async () => {
            applyStubs({config: {...defaultConfig(), alertRules: []}});
            const dispatched = [];
            KbAlertingService.dispatchAlert = async (a) => { dispatched.push(a) };

            await KbAlertingService.pulse();

            expect(dispatched).toHaveLength(0);
        });

        test('routes each breached-rule alert to its channel dispatcher', async () => {
            applyStubs();
            const consoleAlerts = [], a2aAlerts = [];
            KbAlertingService.dispatchConsole = (a) => { consoleAlerts.push(a) };
            KbAlertingService.dispatchA2A     = async (a) => { a2aAlerts.push(a) };

            await KbAlertingService.start(); // seeds an empty cooldownState
            await KbAlertingService.pulse();

            // RULE breaches on tenant-x via 2 channels → one console, one a2a alert.
            expect(consoleAlerts).toHaveLength(1);
            expect(a2aAlerts).toHaveLength(1);
            expect(consoleAlerts[0]).toMatchObject({tenantId: 'tenant-x', metric: 'errorRate', channel: 'console'});
            expect(a2aAlerts[0].channel).toBe('a2a:@neo-gpt');
        });

        test('threads cooldown state across pulses — a second pulse is suppressed', async () => {
            applyStubs();
            const dispatched = [];
            KbAlertingService.dispatchConsole = (a) => { dispatched.push(a) };
            KbAlertingService.dispatchA2A     = async (a) => { dispatched.push(a) };

            await KbAlertingService.start();
            await KbAlertingService.pulse();
            expect(dispatched).toHaveLength(2);

            // Same breach, within the cooldown window → fully suppressed.
            await KbAlertingService.pulse();
            expect(dispatched).toHaveLength(2);
        });

        test('logs a warning for a malformed alert rule and still dispatches valid ones', async () => {
            applyStubs({config: {...defaultConfig(), alertRules: [{metric: 'bogus', threshold: 1, severity: 'warning', channels: ['console']}, RULE]}});
            const warns = [];
            logger.warn = (msg) => { warns.push(msg) };
            const dispatched = [];
            KbAlertingService.dispatchConsole = (a) => { dispatched.push(a) };
            KbAlertingService.dispatchA2A     = async (a) => { dispatched.push(a) };

            await KbAlertingService.start();
            await KbAlertingService.pulse();

            expect(warns.some(w => w.includes('Skipped malformed alert rule'))).toBe(true);
            expect(dispatched).toHaveLength(2); // the valid RULE still fires
        });

        test('reschedules from the finally block even when fetchRollup throws', async () => {
            applyStubs();
            KbAlertingService.fetchRollup = async () => { throw new Error('telemetry store down') };
            let rescheduled = 0;
            KbAlertingService.scheduleNext = () => { rescheduled++ };

            await KbAlertingService.pulse();

            expect(rescheduled).toBe(1);
        });
    });

    test.describe('dispatchAlert routing', () => {
        test('a webhook channel is recognized but not dispatched (V1.5-deferred)', async () => {
            applyStubs();
            const warns = [];
            logger.warn = (msg) => { warns.push(msg) };
            let consoleCalls = 0, a2aCalls = 0;
            KbAlertingService.dispatchConsole = () => { consoleCalls++ };
            KbAlertingService.dispatchA2A     = async () => { a2aCalls++ };

            await KbAlertingService.dispatchAlert({tenantId: 'tenant-x', channel: 'webhook:https://example.test/hook', severity: 'warning'});

            expect(consoleCalls).toBe(0);
            expect(a2aCalls).toBe(0);
            expect(warns.some(w => w.includes('Webhook channel deferred to V1.5'))).toBe(true);
        });

        test('a dispatch failure is caught and logged — dispatchAlert never throws', async () => {
            applyStubs();
            const errors = [];
            logger.error = (msg) => { errors.push(msg) };
            KbAlertingService.dispatchA2A = async () => { throw new Error('mailbox unreachable') };

            await expect(
                KbAlertingService.dispatchAlert({tenantId: 'tenant-x', channel: 'a2a:@neo-gpt', severity: 'warning'})
            ).resolves.toBeUndefined();
            expect(errors.some(e => e.includes('Alert dispatch failed'))).toBe(true);
        });
    });

    test.describe('dispatchA2A', () => {
        /** Captures `addMessage` payloads + neutralizes the RequestContextService wrapper. */
        function captureA2A() {
            const sent = [], contexts = [];
            RequestContextService.run        = async (ctx, fn) => {
                contexts.push(ctx);
                return fn()
            };
            MailboxService.isReachableTarget = () => true; // tests below use resolvable targets
            MailboxService.addMessage        = async (args) => { sent.push(args); return {messageId: 'MESSAGE:test'} };
            return {sent, contexts};
        }

        test('direct-DM — dispatches addMessage to the canonical identity target', async () => {
            const {sent} = captureA2A();

            await KbAlertingService.dispatchA2A({
                tenantId: 'tenant-x', repoSlug: 'repo-x', metric: 'errorRate', value: 0.3,
                threshold: 0.1, severity: 'warning', channel: 'a2a:@neo-gpt', deliveryMode: 'wake'
            });

            expect(sent).toHaveLength(1);
            expect(sent[0].to).toBe('@neo-gpt');
            expect(sent[0].subject).toContain('[alert]');
            expect(sent[0].wakeSuppressed).toBe(false);
        });

        test('explicit broadcast — dispatches to AGENT:* when the rule opts in', async () => {
            const {sent} = captureA2A();

            await KbAlertingService.dispatchA2A({
                tenantId: 'tenant-x', repoSlug: 'repo-x', metric: 'errorRate', value: 0.3,
                threshold: 0.1, severity: 'warning', channel: 'a2a:AGENT:*', deliveryMode: 'wake'
            });

            expect(sent[0].to).toBe('AGENT:*');
        });

        test('audit delivery mode maps to wakeSuppressed:true; critical maps to high priority', async () => {
            const {sent} = captureA2A();

            await KbAlertingService.dispatchA2A({
                tenantId: 'tenant-x', repoSlug: 'repo-x', metric: 'errorRate', value: 0.9,
                threshold: 0.1, severity: 'critical', channel: 'a2a:@neo-gpt', deliveryMode: 'audit'
            });

            expect(sent[0].wakeSuppressed).toBe(true);
            expect(sent[0].priority).toBe('high');
        });

        test('normalizes an unprefixed NEO_AGENT_IDENTITY before binding sender context (#11811)', async () => {
            const {contexts} = captureA2A();
            process.env.NEO_AGENT_IDENTITY = 'neo-opus-4-7';

            await KbAlertingService.dispatchA2A({
                tenantId: 'tenant-x', repoSlug: 'repo-x', metric: 'errorRate', value: 0.3,
                threshold: 0.1, severity: 'warning', channel: 'a2a:@neo-gpt', deliveryMode: 'wake'
            });

            expect(contexts[0].agentIdentityNodeId).toBe('@neo-opus-4-7');
        });

        test('skips an unresolvable A2A target before dispatch — no addMessage call', async () => {
            // An unresolvable target (not a registered @<identity>, not AGENT:*) must be
            // rejected before dispatch.
            const {sent} = captureA2A();
            MailboxService.isReachableTarget = () => false; // simulate an unregistered target
            const warns = [];
            logger.warn = (msg) => { warns.push(msg) };

            await KbAlertingService.dispatchA2A({
                tenantId: 'tenant-x', repoSlug: 'repo-x', metric: 'errorRate', value: 0.3,
                threshold: 0.1, severity: 'warning', channel: 'a2a:@not-a-real-agent', deliveryMode: 'wake'
            });

            expect(sent).toHaveLength(0); // MailboxService.addMessage never called
            expect(warns.some(w => w.includes('unresolvable A2A target'))).toBe(true);
        });
    });

    test.describe('dispatchConsole', () => {
        test('maps critical to logger.error and warning to logger.warn', () => {
            const warns = [], errors = [];
            logger.warn  = (msg) => { warns.push(msg) };
            logger.error = (msg) => { errors.push(msg) };

            KbAlertingService.dispatchConsole({tenantId: 't', repoSlug: 'r', metric: 'errorRate', value: 0.2, threshold: 0.1, severity: 'warning'});
            KbAlertingService.dispatchConsole({tenantId: 't', repoSlug: 'r', metric: 'errorRate', value: 0.9, threshold: 0.1, severity: 'critical'});

            expect(warns).toHaveLength(1);
            expect(errors).toHaveLength(1);
            expect(warns[0]).toContain('[alert] warning');
            expect(errors[0]).toContain('[alert] critical');
        });
    });
});
