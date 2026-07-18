import {test, expect}                                          from '@playwright/test';
import {DEFAULT_INACTIVITY_THRESHOLD_MS, resolveHeartbeatMode} from '../../../../../../../ai/daemons/orchestrator/scheduling/nightShiftPolicy.mjs';

/**
 * @summary The night-shift decision contract, every tier driven directly: an explicit operator
 * setting is never overridden in either direction, the policy fills only the unset gap, operator
 * inactivity past the threshold flips night-shift ON, and blindness (no presence signal) reads as
 * PRESENT — a daemon that cannot see must not get loud.
 */
test.describe('ai/daemons/orchestrator/scheduling/nightShiftPolicy — resolveHeartbeatMode', () => {
    const NOW = 1_800_000_000_000;
    const MIN = 60_000;

    test('tier 1: an explicit operator setting wins outright, in BOTH directions — the policy never fights a decision', () => {
        // explicit ON runs regardless of presence
        const on = resolveHeartbeatMode({manualEnabled: true, policyMode: 'presence-aware', operatorLastActiveAt: NOW, now: NOW});
        expect(on).toMatchObject({heartbeatActive: true, mode: 'manual-on'});

        // explicit OFF holds even with the operator gone for hours — "wakes off, full stop" is respected
        const off = resolveHeartbeatMode({manualEnabled: false, policyMode: 'presence-aware', operatorLastActiveAt: NOW - 300 * MIN, now: NOW});
        expect(off).toMatchObject({heartbeatActive: false, mode: 'manual-off'})
    });

    test('tier 2: night-shift engages only past the inactivity threshold, and disengages on operator return', () => {
        const base = {manualEnabled: null, policyMode: 'presence-aware', now: NOW, inactivityThresholdMs: 40 * MIN};

        // operator active 10 minutes ago: day-quiet
        expect(resolveHeartbeatMode({...base, operatorLastActiveAt: NOW - 10 * MIN}))
            .toMatchObject({heartbeatActive: false, mode: 'day-quiet'});

        // operator inactive 41 minutes: night-shift
        const night = resolveHeartbeatMode({...base, operatorLastActiveAt: NOW - 41 * MIN});
        expect(night).toMatchObject({heartbeatActive: true, mode: 'night-shift'});
        expect(night.reason).toContain('41min');

        // exact threshold boundary counts as inactive (>=)
        expect(resolveHeartbeatMode({...base, operatorLastActiveAt: NOW - 40 * MIN}).mode).toBe('night-shift')
    });

    test('tier 3: blindness is presence — a missing/garbage presence signal never auto-activates night mode', () => {
        const base = {manualEnabled: null, policyMode: 'presence-aware', now: NOW};

        for (const operatorLastActiveAt of [null, undefined, NaN, 'yesterday']) {
            const verdict = resolveHeartbeatMode({...base, operatorLastActiveAt});
            expect(verdict, `presence=${String(operatorLastActiveAt)}`).toMatchObject({heartbeatActive: false, mode: 'day-quiet'})
        }
    });

    test('legacy manual-only mode: unset manual means quiet — the pre-policy semantics are byte-preserved', () => {
        // no policyMode at all, and an unset manual flag: heartbeat off (today's behavior for an unset toggle)
        expect(resolveHeartbeatMode({manualEnabled: null, operatorLastActiveAt: NOW - 500 * MIN, now: NOW}))
            .toMatchObject({heartbeatActive: false, mode: 'day-quiet'});

        // an unknown/typo policy mode degrades to the same legacy semantics, never to loud
        expect(resolveHeartbeatMode({manualEnabled: null, policyMode: 'presenceaware', operatorLastActiveAt: NOW - 500 * MIN, now: NOW}).heartbeatActive).toBe(false)
    });

    test('garbage thresholds fall back to the default instead of misbehaving', () => {
        const base = {manualEnabled: null, policyMode: 'presence-aware', now: NOW};

        for (const inactivityThresholdMs of [0, -5, NaN, Infinity]) {
            // every garbage shape (zero, negative, NaN, non-finite Infinity) falls back to the
            // DEFAULT window — inactive longer than it, so night-shift under the fallback
            const verdict = resolveHeartbeatMode({
                ...base, inactivityThresholdMs,
                operatorLastActiveAt: NOW - DEFAULT_INACTIVITY_THRESHOLD_MS - MIN
            });
            expect(verdict.mode, `threshold=${inactivityThresholdMs}`).toBe('night-shift')
        }
    });

    test('the empty call is safe and quiet (total function, no-throw contract)', () => {
        expect(resolveHeartbeatMode()).toMatchObject({heartbeatActive: false, mode: 'day-quiet'});
        expect(resolveHeartbeatMode(undefined)).toMatchObject({heartbeatActive: false})
    })
});
