import {test, expect} from '@playwright/test';
import {
    planEmbeddingSpans,
    resolveCompletedPrefix,
    resolveDispatchPlan,
    resolveEmbeddingTaskBudget
} from '../../../../../../ai/services/memory-core/helpers/embeddingDispatchPlan.mjs';

/**
 * The plan arithmetic the concurrent embedding dispatch rests on.
 *
 * The load-bearing function is `resolveCompletedPrefix`. Its predecessor was inline arithmetic —
 * `completedChunkCount * chunkSize` — which named a span correctly only while provider requests
 * completed in issue order. Under concurrency a span can land after a hole, and that product then
 * claims a range containing inputs that never completed.
 *
 * The failure mode this guards is quiet rather than loud: `toOrderedEmbeddings` refuses a
 * non-densely-indexed carry, so the wrong-span product got caught downstream and the error travelled
 * with nothing attached. No corrupt vectors — just work conservation switching itself off, and a lane
 * re-purchasing the same vectors on every retry with nothing in the logs to say so.
 */
test.describe('embedding dispatch plan', () => {
    test.describe('planEmbeddingSpans', () => {
        test('only the FINAL span may be short, and it carries its real count', () => {
            // The reason spans exist rather than bare offsets: every later decision needs the real
            // count, and re-deriving it is what let a product stand in for a span.
            expect(planEmbeddingSpans({textCount: 7, chunkSize: 3})).toEqual([
                {offset: 0, count: 3},
                {offset: 3, count: 3},
                {offset: 6, count: 1}
            ]);
        });

        test('an exact multiple produces no short span', () => {
            expect(planEmbeddingSpans({textCount: 6, chunkSize: 3})).toEqual([
                {offset: 0, count: 3},
                {offset: 3, count: 3}
            ]);
        });

        test('the spans exactly tile the inputs — no gap, no overlap, no phantom tail', () => {
            // Asserted as a property rather than a third literal, so it holds for widths the literals
            // above do not cover.
            for (const [textCount, chunkSize] of [[1, 1], [5, 2], [10, 4], [13, 5], [100, 7]]) {
                const spans = planEmbeddingSpans({textCount, chunkSize});

                expect(spans.reduce((sum, span) => sum + span.count, 0), `total for ${textCount}/${chunkSize}`).toBe(textCount);
                spans.forEach((span, index) => {
                    expect(span.offset, `offset continuity at ${index} for ${textCount}/${chunkSize}`)
                        .toBe(index === 0 ? 0 : spans[index - 1].offset + spans[index - 1].count);
                });
            }
        });

        test('nothing to send plans nothing', () => {
            expect(planEmbeddingSpans({textCount: 0, chunkSize: 5})).toEqual([]);
        });

        test('a non-positive width cannot produce an infinite loop', () => {
            // A zero width would never advance `offset`. Clamped rather than trusted, because the value
            // arrives from config and a hang is the worst available failure.
            expect(planEmbeddingSpans({textCount: 2, chunkSize: 0})).toEqual([
                {offset: 0, count: 1},
                {offset: 1, count: 1}
            ]);
        });
    });

    test.describe('resolveEmbeddingTaskBudget', () => {
        test('the declared parallelism is a TASK budget, and a valid one passes through', () => {
            // Tasks, not requests: one multi-input POST expands to one task per input, so the work a
            // client offers is concurrency × width. Reading this as a request count multiplies offered
            // work by the width without saying so.
            expect(resolveEmbeddingTaskBudget(4)).toBe(4);
            expect(resolveEmbeddingTaskBudget(1)).toBe(1);
            expect(resolveEmbeddingTaskBudget(16)).toBe(16);
        });

        test('an unresolvable budget THROWS rather than substituting 1', () => {
            // The leaf's own default already covers an absent env var, so a value arriving here that is
            // not a positive integer is a configuration defect. Falling back would let the lane report
            // healthy while ignoring what the deployment declared — the failure mode this whole lane is
            // about, one layer up.
            for (const value of [undefined, null, 0, -3, 2.5, NaN, 'four', {}]) {
                expect(
                    () => resolveEmbeddingTaskBudget(value),
                    `must throw for ${JSON.stringify(value) ?? String(value)}`
                ).toThrow(/positive integer task budget/);
            }
        });
    });

    test.describe('resolveDispatchPlan', () => {
        test('offered tasks NEVER exceed the budget, and one task stays reserved', () => {
            // The property that makes the plan correct rather than merely concurrent. Asserted across a
            // grid rather than at one point, because the interesting failures are at the boundaries
            // where width and budget interact.
            for (const taskBudget of [1, 2, 3, 4, 8, 16]) {
                for (const requestWidth of [1, 2, 5, 20]) {
                    const plan = resolveDispatchPlan({textCount: 40, requestWidth, taskBudget});

                    if (taskBudget > 1) {
                        expect(
                            plan.offeredTasks,
                            `budget ${taskBudget} width ${requestWidth} offered ${plan.offeredTasks}`
                        ).toBeLessThanOrEqual(taskBudget);

                        expect(
                            plan.offeredTasks,
                            `budget ${taskBudget} must keep one task free for interactive work`
                        ).toBeLessThanOrEqual(taskBudget - 1);
                        expect(plan.reservedTasks).toBe(1);
                    }
                }
            }
        });

        test('at a budget of ONE the configured width stands — nothing to reserve, nothing to protect', () => {
            // Deliberate, and the safest property of this plan: the single-slot default is unchanged.
            // Clamping there would protect no headroom (you cannot reserve a task from a budget of 1)
            // while turning one request into one-per-input. The provider queues the extra tasks either
            // way, so the clamp would buy round trips and nothing else.
            //
            // An earlier version of this plan clamped unconditionally and split a two-input batch into
            // two single-input requests at the default — caught by a pre-existing lms-server fixture,
            // not by reasoning.
            const plan = resolveDispatchPlan({textCount: 40, requestWidth: 5, taskBudget: 1});

            expect({width: plan.width, concurrency: plan.concurrency, reservedTasks: plan.reservedTasks})
                .toEqual({width: 5, concurrency: 1, reservedTasks: 0});
        });

        test('at four declared tasks with width 5 it reproduces the old clamp exactly', () => {
            // Not a coincidence and worth pinning: the old `parallel - 1` width was correct arithmetic
            // in the task unit at this configuration. The model changed; this output did not.
            const plan = resolveDispatchPlan({textCount: 40, requestWidth: 5, taskBudget: 4});

            expect({width: plan.width, concurrency: plan.concurrency, offeredTasks: plan.offeredTasks})
                .toEqual({width: 3, concurrency: 1, offeredTasks: 3});
        });

        test('concurrency appears only once the budget exceeds the width', () => {
            // The honest statement of what this delivers: fan-out is a property of the deployment's
            // leaves, not of the code. A lane at four tasks with width 5 gets none.
            expect(resolveDispatchPlan({textCount: 40, requestWidth: 5, taskBudget: 8}).concurrency).toBe(1);
            expect(resolveDispatchPlan({textCount: 40, requestWidth: 5, taskBudget: 16}).concurrency).toBe(3);
            expect(resolveDispatchPlan({textCount: 40, requestWidth: 2, taskBudget: 16}).concurrency).toBe(7);
            expect(resolveDispatchPlan({textCount: 40, requestWidth: 1, taskBudget: 4}).concurrency).toBe(3);
        });

        test('concurrency never exceeds the work that exists', () => {
            // Reporting an offer the batch cannot make would overstate the plan. Three inputs at width
            // 1 is three spans, so a budget of 16 still only fans out three ways.
            const plan = resolveDispatchPlan({textCount: 3, requestWidth: 1, taskBudget: 16});

            expect(plan.spans).toHaveLength(3);
            expect(plan.concurrency).toBe(3);
        });

        test('the spans tile the inputs at the CLAMPED width, not the configured one', () => {
            // The clamp is a real change to the durability contract, so the spans must reflect it
            // rather than the configured value a reader might assume.
            const plan = resolveDispatchPlan({textCount: 7, requestWidth: 5, taskBudget: 4});

            expect(plan.width).toBe(3);
            expect(plan.spans).toEqual([
                {offset: 0, count: 3},
                {offset: 3, count: 3},
                {offset: 6, count: 1}
            ]);
        });
    });

    test.describe('resolveCompletedPrefix', () => {
        const spans = planEmbeddingSpans({textCount: 10, chunkSize: 3}); // 3,3,3,1

        test('a contiguous prefix carries the SUM of real span counts, not count × width', () => {
            // With a short final span in play, a product and a sum diverge — which is the whole reason
            // the product was wrong even before concurrency made it wrong more often.
            expect(resolveCompletedPrefix({spans, completedFlags: [true, true, true, true]}))
                .toEqual({chunkCount: 4, textCount: 10, droppedChunkCount: 0});

            expect(resolveCompletedPrefix({spans, completedFlags: [true, true, false, false]}))
                .toEqual({chunkCount: 2, textCount: 6, droppedChunkCount: 0});
        });

        test('THE ARM THIS EXISTS FOR: a completion after a hole is not carried, and is COUNTED', () => {
            // Spans 0 and 2 landed, span 1 failed. The predecessor computed
            // `completedChunkCount(2) * chunkSize(3)` = 6 texts — a range whose second half never
            // completed. Downstream refused it and the carry was dropped in silence.
            const prefix = resolveCompletedPrefix({spans, completedFlags: [true, false, true, false]});

            expect(prefix.chunkCount, 'only span 0 is bindable by position').toBe(1);
            expect(prefix.textCount, 'the product would have claimed 6').toBe(3);
            expect(prefix.droppedChunkCount, 'span 2 completed and cannot be bound — the loss must be reportable').toBe(1);
        });

        test('a hole at the very front carries nothing, and that is DISTINGUISHABLE from nothing landing', () => {
            // The two cases share one code path today, and only one of them is a reason to drop a
            // carry. `droppedChunkCount` is what separates them.
            const afterHole = resolveCompletedPrefix({spans, completedFlags: [false, true, true, true]}),
                  nothing   = resolveCompletedPrefix({spans, completedFlags: [false, false, false, false]});

            expect(afterHole).toEqual({chunkCount: 0, textCount: 0, droppedChunkCount: 3});
            expect(nothing).toEqual({chunkCount: 0, textCount: 0, droppedChunkCount: 0});
            expect(
                afterHole.droppedChunkCount === nothing.droppedChunkCount,
                'if these were equal the caller could not tell lost work from no work'
            ).toBe(false);
        });

        test('the carried textCount is always a valid dense range over the inputs', () => {
            // The property the consumer depends on: it does `slice(0, textCount)` and binds by
            // position, so `textCount` must equal the sum of the first `chunkCount` spans — never more.
            for (const flags of [
                [true, true, true, true],
                [true, true, false, true],
                [true, false, false, false],
                [false, true, true, true],
                [false, false, false, false]
            ]) {
                const {chunkCount, textCount} = resolveCompletedPrefix({spans, completedFlags: flags}),
                      expected                = spans.slice(0, chunkCount).reduce((sum, span) => sum + span.count, 0);

                expect(textCount, `dense range for ${JSON.stringify(flags)}`).toBe(expected);
            }
        });
    });
});
