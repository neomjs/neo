import {test, expect}                                    from '@playwright/test';
import {getTemporalWindowPresets, resolveTemporalWindow} from '../../../../../../ai/services/memory-core/helpers/temporalWindowResolver.mjs';

const DAY_MS = 24 * 60 * 60 * 1000,
      // fixed injected reference clock — the resolver never reads a clock internally, so every case is deterministic
      NOW_ISO = '2026-07-12T12:00:00.000Z',
      NOW_MS  = Date.parse(NOW_ISO);

test.describe('temporalWindowResolver — pure half-open window resolution (temporal-pyramid dynamic-synthesis front)', () => {
    test('preset weekly resolves to [now - 7d, now), tier L3, half-open', () => {
        const window = resolveTemporalWindow({preset: 'weekly', now: NOW_ISO});

        expect(window.windowStart).toBe(NOW_MS - 7 * DAY_MS);
        expect(window.windowEnd).toBe(NOW_MS);
        expect(window.tier).toBe('L3');
        expect(window.preset).toBe('weekly');
        expect(window.windowSemantics.interval).toBe('half-open');
        expect(window.windowSemantics.durationMs).toBe(7 * DAY_MS)
    });

    test('the named grains map to their pyramid tiers; the finer grains carry no tier', () => {
        expect(resolveTemporalWindow({preset: 'weekly',    now: NOW_MS}).tier).toBe('L3');
        expect(resolveTemporalWindow({preset: 'monthly',   now: NOW_MS}).tier).toBe('L4');
        expect(resolveTemporalWindow({preset: 'quarterly', now: NOW_MS}).tier).toBe('L5');
        // daily / 3-day are first-class arbitrary grains BELOW the pyramid — no L-tier
        expect(resolveTemporalWindow({preset: 'daily', now: NOW_MS}).tier).toBeNull();
        expect(resolveTemporalWindow({preset: '3-day', now: NOW_MS}).tier).toBeNull();
        // and their durations are the raw grain, not rounded to a tier
        expect(resolveTemporalWindow({preset: '3-day', now: NOW_MS}).windowSemantics.durationMs).toBe(3 * DAY_MS)
    });

    test('an explicit (windowStart, windowEnd) window is first-class — used verbatim, no preset/tier, no `now` needed', () => {
        const window = resolveTemporalWindow({
            windowStart: '2026-07-01T00:00:00.000Z',
            windowEnd  : '2026-07-08T00:00:00.000Z'
        });

        expect(window.windowStart).toBe(Date.parse('2026-07-01T00:00:00.000Z'));
        expect(window.windowEnd).toBe(Date.parse('2026-07-08T00:00:00.000Z'));
        expect(window.preset).toBeNull();
        expect(window.tier).toBeNull();
        expect(window.windowStartIso).toBe('2026-07-01T00:00:00.000Z');
        expect(window.windowSemantics.filterSet.grain).toBe('explicit')
    });

    test('explicit bounds accept Date objects and epoch-ms numbers, not just ISO strings', () => {
        const fromDates   = resolveTemporalWindow({windowStart: new Date(NOW_MS - DAY_MS), windowEnd: new Date(NOW_MS)}),
              fromNumbers = resolveTemporalWindow({windowStart: NOW_MS - DAY_MS,           windowEnd: NOW_MS});

        expect(fromDates.windowStart).toBe(NOW_MS - DAY_MS);
        expect(fromDates.windowEnd).toBe(NOW_MS);
        expect(fromNumbers.windowStart).toBe(NOW_MS - DAY_MS);
        expect(fromNumbers.windowEnd).toBe(NOW_MS)
    });

    test('boundaries are half-open — durationMs === end - start, so adjacent windows never double-count an edge event', () => {
        const window = resolveTemporalWindow({
            windowStart: NOW_MS - 3 * DAY_MS,
            windowEnd  : NOW_MS
        });

        // an event stamped exactly at windowEnd is NOT in this window (it opens the next one) — proven by the
        // exclusive-end contract: [start, end) has duration end-start with the end instant excluded
        expect(window.windowSemantics.durationMs).toBe(3 * DAY_MS);
        expect(window.windowSemantics.interval).toBe('half-open')
    });

    test('every result declares its filter-set (grain + partition) — cross-window comparison is defined only within an identical set', () => {
        const unified  = resolveTemporalWindow({preset: 'weekly', now: NOW_MS}),
              perAgent = resolveTemporalWindow({preset: 'weekly', now: NOW_MS, partition: 'neo-opus-ada'});

        expect(unified.partition).toBe('unified');
        expect(unified.windowSemantics.filterSet).toEqual({grain: 'weekly', partition: 'unified'});
        expect(perAgent.partition).toBe('neo-opus-ada');
        expect(perAgent.windowSemantics.filterSet).toEqual({grain: 'weekly', partition: 'neo-opus-ada'})
    });

    test('getTemporalWindowPresets exposes exactly the supported grains', () => {
        expect(getTemporalWindowPresets().sort()).toEqual(['3-day', 'daily', 'monthly', 'quarterly', 'weekly'])
    });

    test.describe('fails loud — never synthesizes a silently-wrong window', () => {
        test('a non-(start < end) explicit window throws (zero-width and inverted both rejected)', () => {
            expect(() => resolveTemporalWindow({windowStart: NOW_MS, windowEnd: NOW_MS})).toThrow(/windowStart < windowEnd/);
            expect(() => resolveTemporalWindow({windowStart: NOW_MS, windowEnd: NOW_MS - DAY_MS})).toThrow(/windowStart < windowEnd/)
        });

        test('an unparseable explicit bound throws (never coerced to a wrong instant)', () => {
            expect(() => resolveTemporalWindow({windowStart: 'not-a-date', windowEnd: NOW_MS})).toThrow(/parseable/)
        });

        test('an unknown preset throws and names the supported set', () => {
            expect(() => resolveTemporalWindow({preset: 'fortnightly', now: NOW_MS})).toThrow(/unknown grain preset/)
        });

        test('a preset without an injected `now` throws (the resolver never reads a clock itself)', () => {
            expect(() => resolveTemporalWindow({preset: 'weekly'})).toThrow(/injected `now`/)
        });

        test('supplying neither a preset nor an explicit window throws', () => {
            expect(() => resolveTemporalWindow({})).toThrow(/either a preset or an explicit/)
        });

        test('supplying BOTH a preset and an explicit window throws (ambiguous request)', () => {
            expect(() => resolveTemporalWindow({preset: 'weekly', windowStart: NOW_MS - DAY_MS, windowEnd: NOW_MS})).toThrow(/not both/)
        })
    })
});
