import {test, expect} from '@playwright/test';
import {
    COALESCE_HARD_CAP_MS,
    computeFlushDelayMs,
    POST_FLUSH_REFRACTORY_MS,
    resolveCoalesceWindowMs
} from '../../../../../../ai/daemons/wake/coalescePolicy.mjs';

/**
 * @summary The wake-coalescing policy, pinned at the pure seam.
 *
 * Every witness maps to a ticket AC: override-else-default window resolution with the pre-existing
 * clamp semantics, the rolling window whose t=0/100/170s arrivals converge on ONE flush at the
 * hard cap, the post-flush refractory that keeps a just-flushed seat from re-waking at
 * just-outside-window spacing, cap-beats-refractory (worst-case latency is a guarantee, the
 * refractory only a floor), and the explicit-immediate exemption (`windowMs === 0` bypasses both).
 */
test.describe('ai/daemons/wake/coalescePolicy', () => {
    const T0 = 1_000_000;

    test.describe('resolveCoalesceWindowMs — override-else-default with the landed clamp', () => {
        test('a per-subscription override wins over the config default', () => {
            expect(resolveCoalesceWindowMs({overrideSeconds: 30, defaultSeconds: 150})).toBe(30_000)
        });

        test('undefined and null overrides fall through to the default (the pre-existing ?? semantics)', () => {
            expect(resolveCoalesceWindowMs({overrideSeconds: undefined, defaultSeconds: 150})).toBe(150_000);
            expect(resolveCoalesceWindowMs({overrideSeconds: null,      defaultSeconds: 150})).toBe(150_000)
        });

        test('the clamp bounds both ends: the hard cap above, zero below — and explicit 0 survives as 0', () => {
            expect(resolveCoalesceWindowMs({overrideSeconds: 900, defaultSeconds: 150})).toBe(COALESCE_HARD_CAP_MS);
            expect(resolveCoalesceWindowMs({overrideSeconds: -5,  defaultSeconds: 150})).toBe(0);
            expect(resolveCoalesceWindowMs({overrideSeconds: 0,   defaultSeconds: 150})).toBe(0)
        })
    });

    test.describe('computeFlushDelayMs — rolling window with the hard cap', () => {
        test('the AC sequence: events at t=0/100/170s (window 150s) converge on ONE flush at the 300s cap', () => {
            const windowMs = 150_000, firstQueuedAt = T0;

            // each queued event re-arms; the previous timer is replaced, so the LAST delay decides
            const d1 = computeFlushDelayMs({now: T0,           windowMs, firstQueuedAt});
            const d2 = computeFlushDelayMs({now: T0 + 100_000, windowMs, firstQueuedAt});
            const d3 = computeFlushDelayMs({now: T0 + 170_000, windowMs, firstQueuedAt});

            expect(d1).toBe(150_000);                    // quiet would flush at t+150s
            expect(d2).toBe(150_000);                    // rolled: would flush at t+250s
            expect(d3).toBe(130_000);                    // cap-bounded: fires exactly at t+300s
            expect(T0 + 170_000 + d3).toBe(firstQueuedAt + COALESCE_HARD_CAP_MS)
        });

        test('a quiet stream flushes at exactly the window', () => {
            expect(computeFlushDelayMs({now: T0, windowMs: 150_000, firstQueuedAt: T0})).toBe(150_000)
        });

        test('the cap fully elapsed returns 0 — flush now, never negative', () => {
            expect(computeFlushDelayMs({now: T0 + 400_000, windowMs: 150_000, firstQueuedAt: T0})).toBe(0)
        })
    });

    test.describe('computeFlushDelayMs — post-flush refractory', () => {
        test('an event 10s after a delivered flush does NOT arm an immediate wake: the refractory floor holds a short window out', () => {
            const delay = computeFlushDelayMs({
                now          : T0 + 10_000,
                windowMs     : 30_000,          // short per-subscription override — where the floor is visible
                firstQueuedAt: T0 + 10_000,
                lastFlushAt  : T0
            });

            expect(delay).toBe(POST_FLUSH_REFRACTORY_MS - 10_000)   // held to the refractory boundary
        });

        test('the refractory is a floor, not additive: a window already longer than the remaining refractory dominates', () => {
            expect(computeFlushDelayMs({
                now          : T0 + 10_000,
                windowMs     : 150_000,
                firstQueuedAt: T0 + 10_000,
                lastFlushAt  : T0
            })).toBe(150_000)
        });

        test('an old flush (beyond the refractory) contributes nothing', () => {
            expect(computeFlushDelayMs({
                now          : T0,
                windowMs     : 150_000,
                firstQueuedAt: T0,
                lastFlushAt  : T0 - POST_FLUSH_REFRACTORY_MS - 1
            })).toBe(150_000)
        });

        test('the cap BEATS the refractory: worst-case latency is the guarantee, the floor yields', () => {
            const delay = computeFlushDelayMs({
                now          : T0 + 290_000,     // 10s of cap left
                windowMs     : 150_000,
                firstQueuedAt: T0,
                lastFlushAt  : T0 + 280_000      // refractory would want 110s more
            });

            expect(delay).toBe(10_000)
        })
    });

    test('windowMs === 0 is the explicit-immediate contract: refractory and cap both ignored', () => {
        expect(computeFlushDelayMs({
            now          : T0,
            windowMs     : 0,
            firstQueuedAt: T0 - 999_999,        // cap long passed
            lastFlushAt  : T0                   // refractory at its freshest
        })).toBe(0)
    });

    test('constants sanity: the refractory sits strictly inside the hard cap', () => {
        expect(POST_FLUSH_REFRACTORY_MS).toBeGreaterThan(0);
        expect(POST_FLUSH_REFRACTORY_MS).toBeLessThan(COALESCE_HARD_CAP_MS)
    })
});
