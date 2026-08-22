import {setup} from '../../../../../../setup.mjs';

const appName = 'AgentFreshnessTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

import {classifyPaneFreshness, describePaneFreshness, FRESHNESS_CLASSES} from '../../../../../../../../apps/agentos/util/agentFreshness.mjs';

/**
 * @summary Tests for the FM cockpit detail-pane freshness ledger — the render-correctness
 * render-correctness contract at pane grain: a real observation classifies fresh/stale/lost by
 * age vs its TTL, and anything we cannot place in time degrades to the honest `unobserved`, never
 * a fabricated current claim. `now` is injected + pinned so the contract is deterministic (no
 * clock-brittle `new Date()`).
 */
test.describe('agentFreshness — pane freshness ledger, pure + now-injected (#14608)', () => {
    // a fixed clock + a 30s TTL; every observation below is a fixed offset from NOW
    const
        NOW = Date.parse('2026-07-12T00:00:00.000Z'),
        TTL = 30_000;

    test('classify: an observation within its TTL is fresh and carries its age', () => {
        // 10s old, ttl 30s → fresh
        const result = classifyPaneFreshness({observedAt: '2026-07-11T23:59:50.000Z', freshnessTtl: TTL}, NOW);
        expect(result).toEqual({freshness: 'fresh', observedAt: '2026-07-11T23:59:50.000Z', ageMs: 10_000});

        // the boundary is inclusive: age === TTL is still fresh
        expect(classifyPaneFreshness({observedAt: '2026-07-11T23:59:30.000Z', freshnessTtl: TTL}, NOW).freshness).toBe('fresh')
    });

    test('classify: past the TTL is stale, past LOST_TTL_FACTOR×TTL is lost — both boundaries inclusive-toward-stale', () => {
        // 90s old (30s < 90s ≤ 120s) → stale
        expect(classifyPaneFreshness({observedAt: '2026-07-11T23:58:30.000Z', freshnessTtl: TTL}, NOW).freshness).toBe('stale');
        // exactly 4×TTL (120s) → still stale (inclusive)
        expect(classifyPaneFreshness({observedAt: '2026-07-11T23:58:00.000Z', freshnessTtl: TTL}, NOW).freshness).toBe('stale');
        // 200s old (> 120s) → lost
        expect(classifyPaneFreshness({observedAt: '2026-07-11T23:56:40.000Z', freshnessTtl: TTL}, NOW).freshness).toBe('lost')
    });

    test('classify: an explicit source-reported loss is lost regardless of age', () => {
        // a brand-new observation the source flagged as lost still reads lost — the source wins
        const result = classifyPaneFreshness({observedAt: '2026-07-11T23:59:59.000Z', freshnessTtl: TTL, lost: true}, NOW);
        expect(result).toEqual({freshness: 'lost', observedAt: '2026-07-11T23:59:59.000Z', ageMs: null})
    });

    test('classify: a future/clock-skewed observation clamps to fresh, never a false stale', () => {
        // observed 5s AFTER now (negative age) → fresh, age preserved as negative for the renderer to clamp
        const result = classifyPaneFreshness({observedAt: '2026-07-12T00:00:05.000Z', freshnessTtl: TTL}, NOW);
        expect(result.freshness).toBe('fresh');
        expect(result.ageMs).toBe(-5_000)
    });

    test('classify: anything unplaceable in time degrades to unobserved — never a current claim', () => {
        const cases = [
            {label: 'no observedAt',        ledger: {freshnessTtl: TTL},                                              now: NOW},
            {label: 'no freshnessTtl',      ledger: {observedAt: '2026-07-11T23:59:50.000Z'},                         now: NOW},
            {label: 'ttl not positive',     ledger: {observedAt: '2026-07-11T23:59:50.000Z', freshnessTtl: 0},       now: NOW},
            {label: 'no now',               ledger: {observedAt: '2026-07-11T23:59:50.000Z', freshnessTtl: TTL},     now: null},
            {label: 'unparseable observed', ledger: {observedAt: 'not-a-timestamp',           freshnessTtl: TTL},     now: NOW},
            {label: 'non-object ledger',    ledger: null,                                                             now: NOW},
            {label: 'array ledger',         ledger: [],                                                               now: NOW}
        ];

        for (const {label, ledger, now} of cases) {
            expect(classifyPaneFreshness(ledger, now).freshness, label).toBe('unobserved')
        }
    });

    test('describe: each class renders its own cls token + honest label (fresh/stale show the age)', () => {
        expect(describePaneFreshness({freshness: 'fresh', ageMs: 12_000})).toEqual({
            freshness: 'fresh', cls: ['fm-freshness', 'is-fresh'], label: 'updated 12s ago'
        });
        expect(describePaneFreshness({freshness: 'stale', ageMs: 90_000})).toEqual({
            freshness: 'stale', cls: ['fm-freshness', 'is-stale'], label: 'stale · last seen 1m ago'
        });
        expect(describePaneFreshness({freshness: 'lost', ageMs: null})).toEqual({
            freshness: 'lost', cls: ['fm-freshness', 'is-lost'], label: 'lost — no recent observation'
        });
        // unobserved (and any unknown/empty input) is the honest, never-blank default
        expect(describePaneFreshness({freshness: 'unobserved'})).toEqual({
            freshness: 'unobserved', cls: ['fm-freshness', 'is-unobserved'], label: 'not observed — source not wired'
        });
        expect(describePaneFreshness().freshness).toBe('unobserved')
    });

    test('describe: fresh with no measurable age reads "live"; the age formatter spans s/m/h/d and clamps the future', () => {
        expect(describePaneFreshness({freshness: 'fresh', ageMs: null}).label).toBe('live');
        expect(describePaneFreshness({freshness: 'fresh', ageMs: 45_000}).label).toBe('updated 45s ago');
        expect(describePaneFreshness({freshness: 'fresh', ageMs: 5 * 60_000}).label).toBe('updated 5m ago');
        expect(describePaneFreshness({freshness: 'fresh', ageMs: 3 * 3_600_000}).label).toBe('updated 3h ago');
        expect(describePaneFreshness({freshness: 'fresh', ageMs: 2 * 86_400_000}).label).toBe('updated 2d ago');
        // a negative (future/skew) age never renders a nonsensical future time
        expect(describePaneFreshness({freshness: 'fresh', ageMs: -5_000}).label).toBe('updated 0s ago')
    });

    test('the freshness vocabulary is a frozen closed set', () => {
        expect(FRESHNESS_CLASSES).toEqual(['fresh', 'stale', 'lost', 'unobserved']);
        expect(Object.isFrozen(FRESHNESS_CLASSES)).toBe(true)
    })
});
