import {test, expect} from '@playwright/test';
import {
    COALESCE_HARD_CAP_MS,
    computeFlushDelayMs,
    computeFlushHoldMs,
    isMessageWakeFresh,
    MESSAGE_WAKE_MAX_AGE_MS,
    POST_FLUSH_REFRACTORY_MS,
    resolveCoalesceWindowMs
} from '../../../../../../ai/services/memory-core/wakeCoalescePolicy.mjs';

/**
 * @summary The wake-coalescing policy, pinned at the pure seam.
 *
 * Every witness maps to a ticket AC: override-else-default window resolution with the pre-existing
 * clamp semantics, the rolling window whose t=0/100/170s arrivals converge on ONE flush at the
 * hard cap, the post-flush refractory that keeps a just-flushed seat from re-waking at
 * just-outside-window spacing, cap-beats-refractory (worst-case latency is a guarantee, the
 * refractory only a floor), and the explicit-immediate exemption (`windowMs === 0` bypasses both).
 */
test.describe('ai/services/memory-core/wakeCoalescePolicy', () => {
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

    test.describe('computeFlushHoldMs — the flush-time refractory gate', () => {
        test('a flush firing right after a confirmed delivery is held to the refractory boundary', () => {
            expect(computeFlushHoldMs({
                now          : T0 + 10_000,
                windowMs     : 150_000,
                firstQueuedAt: T0 + 5_000,
                lastFlushAt  : T0
            })).toBe(POST_FLUSH_REFRACTORY_MS - 10_000)
        });

        test('no confirmed delivery, or one beyond the refractory, holds nothing', () => {
            expect(computeFlushHoldMs({now: T0, windowMs: 150_000, firstQueuedAt: T0})).toBe(0);
            expect(computeFlushHoldMs({
                now          : T0,
                windowMs     : 150_000,
                firstQueuedAt: T0,
                lastFlushAt  : T0 - POST_FLUSH_REFRACTORY_MS - 1
            })).toBe(0)
        });

        test('the cap beats the hold: a queue at its latency bound flushes despite an active refractory', () => {
            expect(computeFlushHoldMs({
                now          : T0 + 295_000,     // 5s of cap left on this queue
                windowMs     : 150_000,
                firstQueuedAt: T0,
                lastFlushAt  : T0 + 290_000      // refractory wants 115s more
            })).toBe(5_000)
        });

        test('explicit-immediate subscriptions are exempt from the hold gate too', () => {
            expect(computeFlushHoldMs({
                now          : T0,
                windowMs     : 0,
                firstQueuedAt: T0 - 999_999,
                lastFlushAt  : T0
            })).toBe(0)
        });

        test('the mechanism constants are injectable parameters with the module constants as defaults', () => {
            expect(computeFlushHoldMs({
                now          : T0 + 500,
                windowMs     : 2_000,
                firstQueuedAt: T0 + 500,
                lastFlushAt  : T0,
                refractoryMs : 1_500
            })).toBe(1_000);
            expect(computeFlushDelayMs({
                now          : T0 + 3_000,
                windowMs     : 2_000,
                firstQueuedAt: T0,
                capMs        : 4_000
            })).toBe(1_000)
        })
    });

    test('constants sanity: the refractory sits strictly inside the hard cap', () => {
        expect(POST_FLUSH_REFRACTORY_MS).toBeGreaterThan(0);
        expect(POST_FLUSH_REFRACTORY_MS).toBeLessThan(COALESCE_HARD_CAP_MS)
    })

    test.describe('isMessageWakeFresh — canonical mailbox age is the wake eligibility authority', () => {
        test('accepts canonical timestamps through the closed one-hour boundary', () => {
            expect(isMessageWakeFresh({
                now   : T0,
                sentAt: new Date(T0).toISOString()
            })).toBe(true);
            expect(isMessageWakeFresh({
                now   : T0,
                sentAt: new Date(T0 - MESSAGE_WAKE_MAX_AGE_MS).toISOString()
            })).toBe(true)
        });

        test('rejects messages beyond the horizon instead of promoting replay age to live urgency', () => {
            expect(isMessageWakeFresh({
                now   : T0,
                sentAt: new Date(T0 - MESSAGE_WAKE_MAX_AGE_MS - 1).toISOString()
            })).toBe(false)
        });

        test('fails closed for missing, invalid, numeric, and future timestamps', () => {
            expect(isMessageWakeFresh({now: T0})).toBe(false);
            expect(isMessageWakeFresh({now: T0, sentAt: 'not-an-iso-timestamp'})).toBe(false);
            expect(isMessageWakeFresh({now: T0, sentAt: T0})).toBe(false);
            expect(isMessageWakeFresh({
                now   : T0,
                sentAt: new Date(T0 + 1).toISOString()
            })).toBe(false)
        })
    })
});
