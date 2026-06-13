import {test, expect}                          from '@playwright/test';
import WAKE_LANE_DIRECTIVE, {WAKE_LANE_DIRECTIVE as named} from '../../../../../../ai/daemons/wake/wakeLaneDirective.mjs';

/**
 * @summary Coverage for the standing lifecycle-first wake-lane directive the wake daemon appends to every
 * digest.
 *
 * Pins the lifecycle-first ordering so the discussion / ticket / source wording cannot silently drift
 * back to backlog-first. Asserts the three routing examples (own red/unstable PR · requested
 * review/re-review · peer-green scarce cross-family reviewer) appear and precede fresh-backlog pickup,
 * the legitimate idle terminals are named, and the prose is harness-agnostic.
 */
test.describe('ai/daemons/wake/wakeLaneDirective (#13118)', () => {
    test('default export equals the named export', () => {
        expect(WAKE_LANE_DIRECTIVE).toBe(named);
    });

    test('leads lifecycle-first, not backlog-first (AC1)', () => {
        expect(WAKE_LANE_DIRECTIVE.startsWith('Directive — lifecycle-first')).toBe(true);

        const lifecycleIdx = WAKE_LANE_DIRECTIVE.indexOf('lifecycle');
        const backlogIdx   = WAKE_LANE_DIRECTIVE.indexOf('backlog');

        expect(lifecycleIdx).toBeGreaterThanOrEqual(0);
        expect(backlogIdx).toBeGreaterThan(lifecycleIdx);
        // must NOT open with the old backlog-first 'claim an unclaimed lane' framing
        expect(WAKE_LANE_DIRECTIVE.slice(0, 60)).not.toContain('claim an unclaimed lane');
    });

    test('covers the three #13118 routing tiers (AC2 / AC7)', () => {
        expect(WAKE_LANE_DIRECTIVE, 'own red/unstable/stuck CI PR').toContain('red / unstable / stuck');
        expect(WAKE_LANE_DIRECTIVE, 'requested review/re-review').toContain('requested reviewer');
        expect(WAKE_LANE_DIRECTIVE, 'peer PRs you blocked').toContain('REQUEST_CHANGES');
        expect(WAKE_LANE_DIRECTIVE, 'scarce cross-family reviewer').toContain('scarce viable cross-family reviewer');
    });

    test('fresh-lane / backlog pickup is ordered AFTER the lifecycle queue (AC1 / AC2)', () => {
        const scarceIdx = WAKE_LANE_DIRECTIVE.indexOf('scarce viable cross-family reviewer'); // last lifecycle tier
        const surveyIdx = WAKE_LANE_DIRECTIVE.indexOf('survey the open backlog');
        const freshIdx  = WAKE_LANE_DIRECTIVE.indexOf('fresh unclaimed lane');

        expect(scarceIdx).toBeGreaterThanOrEqual(0);
        expect(surveyIdx).toBeGreaterThan(scarceIdx);
        expect(freshIdx).toBeGreaterThan(scarceIdx);
    });

    test('names the legitimate idle terminals (verified-empty / human merge-gate / blocked-state)', () => {
        expect(WAKE_LANE_DIRECTIVE).toContain('verified-empty');
        expect(WAKE_LANE_DIRECTIVE).toContain('human merge-gate');
        expect(WAKE_LANE_DIRECTIVE).toContain('blocked-state');
    });

    test('is harness-agnostic prose — no harness-specific names (AC6)', () => {
        expect(WAKE_LANE_DIRECTIVE).not.toMatch(/claude|codex|gemini|antigravity/i);
    });
});
