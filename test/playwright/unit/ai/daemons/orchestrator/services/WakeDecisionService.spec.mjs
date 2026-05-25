import {test, expect} from '@playwright/test';
import fs             from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    WakeDecisionService,
    DEFAULT_ACTIVE_WINDOW_MS,
    DEFAULT_IDLE_WINDOW_MS
} from '../../../../../../../ai/daemons/orchestrator/services/WakeDecisionService.mjs';

function createStateFile(name) {
    const dir = path.join(process.cwd(), 'tmp', `wake-decision-${process.pid}-${Date.now()}-${Math.random()}`);
    fs.ensureDirSync(dir);
    return path.join(dir, `${name}.json`);
}

const NOW = Date.parse('2026-05-25T20:00:00.000Z');

test.describe('Neo.ai.daemons.services.WakeDecisionService (#11995, Sub-ii of Epic #11993)', () => {

    // ---------------------------------------------------------------------
    // decideWake — 3-signal pure function
    // ---------------------------------------------------------------------

    test.describe('decideWake — 3-signal pure function', () => {
        test('happy path: active + idle + ready → wake', () => {
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 30 * 60 * 1000] // 30min ago: in active window (3h), past idle window (15m)
            });

            expect(result.wake).toBe(true);
            expect(result.reason).toBe('active+idle+ready');
            expect(result.signals).toEqual({active: true, idle: true, ready: true});
        });

        test('drop active: no activity within 3h → no wake (pathological case 1)', () => {
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 4 * 60 * 60 * 1000] // 4h ago: outside active window
            });

            expect(result.wake).toBe(false);
            expect(result.reason).toBe('no-active-signal');
            expect(result.signals.active).toBe(false);
        });

        test('drop idle: recent activity within 15m → no wake (operator manual-prompt grace, pathological case 2)', () => {
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 10 * 60 * 1000] // 10min ago: in idle window → not idle
            });

            expect(result.wake).toBe(false);
            expect(result.reason).toContain('not-idle');
            expect(result.signals).toEqual({active: true, idle: false, ready: null});
        });

        test('drop ready (readiness sentinel): benched identity → no wake (pathological case 3a)', () => {
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 30 * 60 * 1000],
                activeReadinessSentinel : {ready: false, reason: 'operator-benched', expiresAtMs: NOW + 60 * 60 * 1000}
            });

            expect(result.wake).toBe(false);
            expect(result.reason).toContain('not-ready');
            expect(result.reason).toContain('operator-benched');
            expect(result.signals).toEqual({active: true, idle: true, ready: false});
        });

        test('drop ready (backoff window): error-streak backoff → no wake (pathological case 3b)', () => {
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 30 * 60 * 1000],
                activeBackoffWindow     : {expiresAtMs: NOW + 30 * 60 * 1000, reason: 'error-streak-3'}
            });

            expect(result.wake).toBe(false);
            expect(result.reason).toContain('not-ready');
            expect(result.reason).toContain('backoff window');
            expect(result.signals).toEqual({active: true, idle: true, ready: false});
        });

        test('expired readiness sentinel does not block (sentinel.expiresAtMs < currentTimeMs)', () => {
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 30 * 60 * 1000],
                activeReadinessSentinel : {ready: false, reason: 'expired-block', expiresAtMs: NOW - 60 * 1000}
            });

            expect(result.wake).toBe(true);
        });

        test('ready:true sentinel does not block (only ready:false blocks)', () => {
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 30 * 60 * 1000],
                activeReadinessSentinel : {ready: true, reason: 'manual-override', expiresAtMs: NOW + 60 * 60 * 1000}
            });

            expect(result.wake).toBe(true);
        });

        test('expired backoff window does not block', () => {
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 30 * 60 * 1000],
                activeBackoffWindow     : {expiresAtMs: NOW - 60 * 1000, reason: 'expired'}
            });

            expect(result.wake).toBe(true);
        });

        test('empty recentActivityTimestamps → no wake (no active signal)', () => {
            const result = WakeDecisionService.decideWake({
                identity     : '@neo-gpt',
                currentTimeMs: NOW
            });

            expect(result.wake).toBe(false);
            expect(result.reason).toBe('no-active-signal');
        });

        test('custom activeWindowMs + idleWindowMs respected', () => {
            // Tighter active window (1h instead of 3h)
            const result = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 90 * 60 * 1000], // 90min ago
                activeWindowMs          : 60 * 60 * 1000          // 1h
            });

            expect(result.wake).toBe(false);
            expect(result.reason).toBe('no-active-signal');
        });
    });

    // ---------------------------------------------------------------------
    // parseReadinessSentinel + parseActiveReadinessSentinels
    // ---------------------------------------------------------------------

    test.describe('Readiness sentinel parsing (Sub-ii AC4 + AC5)', () => {
        test('structured task envelope with all fields → returns sentinel', () => {
            const message = {
                id        : 'MESSAGE:abc',
                properties: {
                    task: {
                        type     : 'wake-readiness',
                        ready    : false,
                        reason   : 'rate-limit-exhausted',
                        expiresAt: new Date(NOW + 60 * 60 * 1000).toISOString()
                    }
                }
            };

            const sentinel = WakeDecisionService.parseReadinessSentinel(message, NOW);

            expect(sentinel).toMatchObject({
                ready          : false,
                reason         : 'rate-limit-exhausted',
                sourceMessageId: 'MESSAGE:abc'
            });
            expect(sentinel.expiresAtMs).toBe(NOW + 60 * 60 * 1000);
        });

        test('subject-only spoofing (no task envelope) → returns null (AC5)', () => {
            const message = {
                id        : 'MESSAGE:spoof',
                properties: {
                    subject       : '[wake-readiness] benched until 2026-06-01',
                    taggedConcepts: ['wake-readiness']
                    // NO task envelope
                }
            };

            const sentinel = WakeDecisionService.parseReadinessSentinel(message, NOW);
            expect(sentinel).toBeNull();
        });

        test('task envelope with wrong type → returns null', () => {
            const message = {
                properties: {
                    task: {type: 'a2a-task', ready: false, expiresAt: new Date(NOW + 1000).toISOString()}
                }
            };

            expect(WakeDecisionService.parseReadinessSentinel(message, NOW)).toBeNull();
        });

        test('task envelope without ready field → returns null', () => {
            const message = {
                properties: {
                    task: {type: 'wake-readiness', expiresAt: new Date(NOW + 1000).toISOString()}
                }
            };

            expect(WakeDecisionService.parseReadinessSentinel(message, NOW)).toBeNull();
        });

        test('task envelope without valid expiresAt → returns null', () => {
            const message = {
                properties: {
                    task: {type: 'wake-readiness', ready: false, expiresAt: 'not-a-date'}
                }
            };

            expect(WakeDecisionService.parseReadinessSentinel(message, NOW)).toBeNull();
        });

        test('expired sentinel (expiresAt < currentTime) → returns null (auto-cleared)', () => {
            const message = {
                properties: {
                    task: {type: 'wake-readiness', ready: false, expiresAt: new Date(NOW - 1000).toISOString()}
                }
            };

            expect(WakeDecisionService.parseReadinessSentinel(message, NOW)).toBeNull();
        });

        test('parseActiveReadinessSentinels: multiple blocking sentinels → returns LATEST expiresAt (longest block wins)', () => {
            const earlierBlock = {
                id: 'm1',
                properties: {task: {type: 'wake-readiness', ready: false, reason: 'first', expiresAt: new Date(NOW + 30 * 60 * 1000).toISOString()}}
            };
            const laterBlock = {
                id: 'm2',
                properties: {task: {type: 'wake-readiness', ready: false, reason: 'longer', expiresAt: new Date(NOW + 2 * 60 * 60 * 1000).toISOString()}}
            };

            const active = WakeDecisionService.parseActiveReadinessSentinels([earlierBlock, laterBlock], NOW);

            expect(active.ready).toBe(false);
            expect(active.reason).toBe('longer');
            expect(active.expiresAtMs).toBe(NOW + 2 * 60 * 60 * 1000);
        });

        test('parseActiveReadinessSentinels: ready:false + ready:true mix → blocking (ready:false) wins regardless of expiresAt', () => {
            const blockingNear = {
                id: 'm1',
                properties: {task: {type: 'wake-readiness', ready: false, reason: 'block', expiresAt: new Date(NOW + 5 * 60 * 1000).toISOString()}}
            };
            const readyFar = {
                id: 'm2',
                properties: {task: {type: 'wake-readiness', ready: true, reason: 'override-ready', expiresAt: new Date(NOW + 2 * 60 * 60 * 1000).toISOString()}}
            };

            const active = WakeDecisionService.parseActiveReadinessSentinels([blockingNear, readyFar], NOW);

            expect(active.ready).toBe(false);
            expect(active.reason).toBe('block');
        });

        test('parseActiveReadinessSentinels: all ready:true sentinels → returns EARLIEST expiresAt (most-restrictive)', () => {
            const earlyReady = {
                id: 'm1',
                properties: {task: {type: 'wake-readiness', ready: true, reason: 'short', expiresAt: new Date(NOW + 5 * 60 * 1000).toISOString()}}
            };
            const lateReady = {
                id: 'm2',
                properties: {task: {type: 'wake-readiness', ready: true, reason: 'long', expiresAt: new Date(NOW + 60 * 60 * 1000).toISOString()}}
            };

            const active = WakeDecisionService.parseActiveReadinessSentinels([earlyReady, lateReady], NOW);

            expect(active.ready).toBe(true);
            expect(active.reason).toBe('short');
            expect(active.expiresAtMs).toBe(NOW + 5 * 60 * 1000);
        });

        test('parseActiveReadinessSentinels: empty/no-sentinel-matching → returns null', () => {
            const noise = [
                {id: 'm1', properties: {task: {type: 'a2a-task', ready: false}}},
                {id: 'm2', properties: {subject: '[wake-readiness] no task envelope'}}
            ];

            expect(WakeDecisionService.parseActiveReadinessSentinels(noise, NOW)).toBeNull();
            expect(WakeDecisionService.parseActiveReadinessSentinels([], NOW)).toBeNull();
        });

        test('parseReadinessSentinel: accepts MailboxService.listMessages summary shape (PR #11999 cycle-2)', () => {
            // Sub-iii's getReadinessSentinelMessages helper returns listMessages summaries:
            //   {messageId, task, sentAt, ...}    (flat — `task` at top level)
            // NOT raw node shape:
            //   {id, properties: {task, ...}}     (nested under `properties`)
            // The parser must accept both shapes — otherwise real sentinels parse as null
            // and blocks/ready grants are silently ignored in the production wake loop.
            const summaryShape = {
                messageId: 'MESSAGE:summary-form-uuid',
                task     : {type: 'wake-readiness', ready: false, reason: 'benched-quota', expiresAt: new Date(NOW + 30 * 60 * 1000).toISOString()},
                sentAt   : new Date(NOW - 60_000).toISOString()
            };

            const result = WakeDecisionService.parseReadinessSentinel(summaryShape, NOW);

            expect(result).not.toBeNull();
            expect(result.ready).toBe(false);
            expect(result.reason).toBe('benched-quota');
            expect(result.expiresAtMs).toBe(NOW + 30 * 60 * 1000);
            expect(result.sourceMessageId).toBe('MESSAGE:summary-form-uuid');
        });

        test('parseReadinessSentinel: summary-shape composition with parseActiveReadinessSentinels (PR #11999 cycle-2)', () => {
            // End-to-end: listMessages summaries flow through the composition function
            // (most-restrictive-wins) and produce a correct active sentinel — exercises
            // the same code path the production heartbeat loop uses.
            const summaries = [
                {messageId: 'MESSAGE:summary-1', task: {type: 'wake-readiness', ready: false, reason: 'rate-limit', expiresAt: new Date(NOW + 10 * 60 * 1000).toISOString()}},
                {messageId: 'MESSAGE:summary-2', task: {type: 'wake-readiness', ready: false, reason: 'longer-block', expiresAt: new Date(NOW + 60 * 60 * 1000).toISOString()}},
                {messageId: 'MESSAGE:summary-3', task: {type: 'wake-readiness', ready: true,  reason: 'unblocked',    expiresAt: new Date(NOW + 5 * 60 * 1000).toISOString()}}
            ];

            const active = WakeDecisionService.parseActiveReadinessSentinels(summaries, NOW);

            // ready:false dominates (longest block wins): MESSAGE:summary-2 has 60min expiresAt
            expect(active).not.toBeNull();
            expect(active.ready).toBe(false);
            expect(active.reason).toBe('longer-block');
            expect(active.sourceMessageId).toBe('MESSAGE:summary-2');
        });
    });

    // ---------------------------------------------------------------------
    // Backoff state persistence (Sub-ii AC3)
    // ---------------------------------------------------------------------

    test.describe('Backoff state persistence (Sub-ii AC2 + AC3)', () => {
        test('set + read: setBackoffWindow stores window, getActiveBackoffWindow returns it', () => {
            const stateFile = createStateFile('set-and-read');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            const window = service.setBackoffWindow({
                identity    : '@neo-gpt',
                durationMs  : 60 * 60 * 1000,
                reason      : 'error-streak-3',
                recordedAtMs: NOW
            });

            expect(window.expiresAtMs).toBe(NOW + 60 * 60 * 1000);

            const active = service.getActiveBackoffWindow('@neo-gpt', NOW + 30 * 60 * 1000);
            expect(active.reason).toBe('error-streak-3');
            expect(active.expiresAtMs).toBe(NOW + 60 * 60 * 1000);
        });

        test('restart-persistence: state survives service re-instantiation', () => {
            const stateFile = createStateFile('restart');
            const service1  = Neo.create(WakeDecisionService);
            service1.configure({stateFile});
            service1.setBackoffWindow({identity: '@neo-gpt', durationMs: 60 * 60 * 1000, reason: 'persisted', recordedAtMs: NOW});

            // Simulate restart: new service instance reads from same file
            const service2 = Neo.create(WakeDecisionService);
            service2.configure({stateFile});

            const recovered = service2.getActiveBackoffWindow('@neo-gpt', NOW + 30 * 60 * 1000);
            expect(recovered).not.toBeNull();
            expect(recovered.reason).toBe('persisted');
        });

        test('corrupt-state fallback: malformed JSON file → empty state, no crash', () => {
            const stateFile = createStateFile('corrupt');
            fs.ensureDirSync(path.dirname(stateFile));
            fs.writeFileSync(stateFile, '{not valid json', 'utf8');

            const logs    = [];
            const service = Neo.create(WakeDecisionService);
            service.configure({stateFile, writeLogFn: (level, msg) => logs.push({level, msg})});

            expect(service.backoffState).toEqual({});
            expect(logs).toEqual(expect.arrayContaining([
                expect.objectContaining({level: 'ERROR', msg: expect.stringMatching(/Failed to read backoff state file/)})
            ]));

            // Service still functional after corrupt-state recovery
            service.setBackoffWindow({identity: '@neo-gpt', durationMs: 60_000, recordedAtMs: NOW});
            expect(service.getActiveBackoffWindow('@neo-gpt', NOW)).not.toBeNull();
        });

        test('TTL expiry on read: expired window auto-cleared, getActive returns null', () => {
            const stateFile = createStateFile('ttl-expiry');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            service.setBackoffWindow({identity: '@neo-gpt', durationMs: 60 * 1000, recordedAtMs: NOW});

            // Read AFTER window expiry
            const queryTime = NOW + 5 * 60 * 1000;
            expect(service.getActiveBackoffWindow('@neo-gpt', queryTime)).toBeNull();
            expect(service.backoffState['@neo-gpt']).toBeUndefined();
        });

        test('per-identity isolation: backoff for one identity does not affect others', () => {
            const stateFile = createStateFile('isolation');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            service.setBackoffWindow({identity: '@neo-gpt', durationMs: 60 * 60 * 1000, reason: 'gpt-only', recordedAtMs: NOW});

            expect(service.getActiveBackoffWindow('@neo-gpt', NOW)).not.toBeNull();
            expect(service.getActiveBackoffWindow('@neo-opus-4-7', NOW)).toBeNull();
            expect(service.getActiveBackoffWindow('@neo-gemini-3-1-pro', NOW)).toBeNull();
        });

        test('clearBackoffWindow: explicit clear removes the window', () => {
            const stateFile = createStateFile('explicit-clear');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            service.setBackoffWindow({identity: '@neo-gpt', durationMs: 60 * 60 * 1000, recordedAtMs: NOW});
            expect(service.clearBackoffWindow('@neo-gpt')).toBe(true);
            expect(service.getActiveBackoffWindow('@neo-gpt', NOW)).toBeNull();

            // Idempotent: second clear returns false
            expect(service.clearBackoffWindow('@neo-gpt')).toBe(false);
        });

        test('clearExpiredWindows: sweeps all expired in one pass', () => {
            const stateFile = createStateFile('sweep');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            service.setBackoffWindow({identity: '@a', durationMs: 1 * 60 * 1000, recordedAtMs: NOW}); // expires NOW+1min
            service.setBackoffWindow({identity: '@b', durationMs: 2 * 60 * 1000, recordedAtMs: NOW}); // expires NOW+2min
            service.setBackoffWindow({identity: '@c', durationMs: 60 * 60 * 1000, recordedAtMs: NOW}); // expires NOW+60min

            const cleared = service.clearExpiredWindows(NOW + 5 * 60 * 1000); // After 5min, @a and @b expired
            expect(cleared).toBe(2);
            expect(service.getActiveBackoffWindow('@a', NOW + 5 * 60 * 1000)).toBeNull();
            expect(service.getActiveBackoffWindow('@b', NOW + 5 * 60 * 1000)).toBeNull();
            expect(service.getActiveBackoffWindow('@c', NOW + 5 * 60 * 1000)).not.toBeNull();
        });

        test('setBackoffWindow validation: missing identity throws', () => {
            const stateFile = createStateFile('validation-1');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            expect(() => service.setBackoffWindow({durationMs: 60_000})).toThrow(/identity/);
        });

        test('setBackoffWindow validation: non-positive durationMs throws', () => {
            const stateFile = createStateFile('validation-2');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            expect(() => service.setBackoffWindow({identity: '@a', durationMs: 0})).toThrow(/positive durationMs/);
            expect(() => service.setBackoffWindow({identity: '@a', durationMs: -100})).toThrow(/positive durationMs/);
            expect(() => service.setBackoffWindow({identity: '@a', durationMs: NaN})).toThrow(/positive durationMs/);
        });
    });

    // ---------------------------------------------------------------------
    // End-to-end composition: decideWake + readiness sentinels + backoff
    // ---------------------------------------------------------------------

    test.describe('End-to-end signal composition', () => {
        test('full happy path: active activity + no sentinel + no backoff → wake', () => {
            const stateFile = createStateFile('e2e-happy');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            const decision = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW,
                recentActivityTimestamps: [NOW - 30 * 60 * 1000],
                activeReadinessSentinel : WakeDecisionService.parseActiveReadinessSentinels([], NOW),
                activeBackoffWindow     : service.getActiveBackoffWindow('@neo-gpt', NOW)
            });

            expect(decision.wake).toBe(true);
        });

        test('full block path: backoff + recent error → no wake until backoff expires', () => {
            const stateFile = createStateFile('e2e-block');
            const service   = Neo.create(WakeDecisionService);
            service.configure({stateFile});

            service.setBackoffWindow({identity: '@neo-gpt', durationMs: 30 * 60 * 1000, reason: 'error-streak-3', recordedAtMs: NOW});

            // Query at NOW+20min: activity at NOW is 20min stale (past idle) → idle check OK → backoff check fires
            const decision1 = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW + 20 * 60 * 1000,
                recentActivityTimestamps: [NOW],
                activeReadinessSentinel : null,
                activeBackoffWindow     : service.getActiveBackoffWindow('@neo-gpt', NOW + 20 * 60 * 1000)
            });

            expect(decision1.wake).toBe(false);
            expect(decision1.reason).toContain('error-streak-3');

            // After backoff expires
            const decision2 = WakeDecisionService.decideWake({
                identity                : '@neo-gpt',
                currentTimeMs           : NOW + 60 * 60 * 1000,
                recentActivityTimestamps: [NOW + 20 * 60 * 1000],
                activeReadinessSentinel : null,
                activeBackoffWindow     : service.getActiveBackoffWindow('@neo-gpt', NOW + 60 * 60 * 1000)
            });

            expect(decision2.wake).toBe(true);
        });
    });

    // ---------------------------------------------------------------------
    // Constants (ensure defaults match Epic-documented 3h / 15m)
    // ---------------------------------------------------------------------

    test('DEFAULT_ACTIVE_WINDOW_MS is 3h, DEFAULT_IDLE_WINDOW_MS is 15m (per Epic #11993)', () => {
        expect(DEFAULT_ACTIVE_WINDOW_MS).toBe(3 * 60 * 60 * 1000);
        expect(DEFAULT_IDLE_WINDOW_MS).toBe(15 * 60 * 1000);
    });
});
