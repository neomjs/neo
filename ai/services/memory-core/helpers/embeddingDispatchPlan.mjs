/**
 * @summary Pure plan arithmetic for the OpenAI-compatible embedding dispatch.
 *
 * Four questions the dispatch loop must answer without holding any I/O: what the provider's capacity
 * unit is, how the inputs divide into requests, how many of those may be outstanding, and — after some
 * subset has completed in an arbitrary order — exactly how much work is durably carryable.
 *
 * Separated from the service because two of the four were previously answered by inline arithmetic
 * that only held under assumptions nothing stated. Arithmetic over an implied invariant is not a
 * contract; a function with its own fixtures is.
 *
 * @module ai/services/memory-core/helpers/embeddingDispatchPlan
 */

/**
 * @summary Resolves the provider's declared capacity in TASKS, or refuses.
 *
 * **The capacity unit is a task, not a request.** A local OpenAI-compatible engine expands one
 * multi-input embedding POST into one task per input, so the work a client offers is
 * `concurrency × width` — not `concurrency`. Treating the declared parallelism as a request count
 * silently multiplies offered work by the width.
 *
 * Throws rather than substituting. The leaf's own default already covers an absent env var, so a
 * value that reaches here and is not a positive integer is a configuration defect — and a lane that
 * quietly falls back to 1 reports healthy while ignoring what the deployment declared.
 *
 * @param {*} embeddingParallel Resolved `localModels.embedding.parallel`.
 * @returns {Number} The task budget: a positive integer.
 * @throws {TypeError} When the resolved value is not a positive integer.
 */
export function resolveEmbeddingTaskBudget(embeddingParallel) {
    const declared = Number(embeddingParallel);

    if (!Number.isInteger(declared) || declared < 1) {
        throw new TypeError(`localModels.embedding.parallel must resolve to a positive integer task budget; received ${JSON.stringify(embeddingParallel)}`)
    }

    return declared
}

/**
 * @summary Divides an input count into the provider requests that will carry it.
 *
 * Spans rather than bare offsets, because only the final span may be short and every later decision
 * (carry width, failure attribution) needs the real count rather than a re-derivation of it. Deriving
 * it twice is how a count-times-width product came to stand in for a span.
 *
 * @param {Object} options
 * @param {Number} options.textCount Number of inputs to embed.
 * @param {Number} options.chunkSize Inputs per provider request.
 * @returns {Array<{offset: Number, count: Number}>} Spans in input order; empty when there is nothing to send.
 */
export function planEmbeddingSpans({textCount, chunkSize}) {
    const spans = [],
          width = Math.max(1, Math.floor(chunkSize));

    for (let offset = 0; offset < textCount; offset += width) {
        spans.push({offset, count: Math.min(width, textCount - offset)})
    }

    return spans
}

/**
 * @summary Plans one batch against the provider's declared task capacity.
 *
 * Three decisions, in the order they constrain each other:
 *
 * 1. **Reserve one task for interactive work** when the budget allows it. This preserves the
 *    interactive-headroom contract that the previous width clamp was reaching for: keeping offered
 *    tasks strictly below the declared capacity does leave a slot free, because tasks are the unit
 *    the engine schedules. The clamp's *mechanism* was wrong (it computed a width) and its *intent*
 *    was right.
 * 2. **Clamp the request width to what remains — but only where headroom exists.** A single request
 *    wider than the available budget over-offers by construction, whatever the concurrency. At a
 *    budget of 1 there is nothing to reserve, so the clamp would protect nothing while turning one
 *    request into one-per-input; the provider queues the extra tasks regardless. The single-slot
 *    default therefore keeps its configured width and sees no change from this plan.
 * 3. **Then fan out.** Concurrency is whatever the remaining budget affords at that width, so
 *    `offeredTasks` never exceeds the reserve. Concurrency therefore appears only once the budget
 *    exceeds the width, which is a property of the deployment's leaves rather than of this code.
 *
 * @param {Object} options
 * @param {Number} options.textCount Inputs to embed.
 * @param {Number} options.requestWidth Configured inputs per request (`batchEmbeddingChunkSize`).
 * @param {Number} options.taskBudget From {@link resolveEmbeddingTaskBudget}.
 * @param {Boolean} [options.reserveInteractiveTask=true] Hold one task back for latency-sensitive work when the budget allows.
 * @returns {{spans: Array, width: Number, concurrency: Number, taskBudget: Number, reservedTasks: Number, offeredTasks: Number}}
 */
export function resolveDispatchPlan({textCount, requestWidth, taskBudget, reserveInteractiveTask = true}) {
    // Headroom exists only above a budget of 1. At a single declared task there is nothing to
    // reserve, so clamping the width buys no protection and costs a round trip per input — the
    // provider queues the extra tasks either way. So the single-slot default keeps its configured
    // width and this plan changes nothing for it.
    const hasHeadroom = reserveInteractiveTask && taskBudget > 1,
          available   = hasHeadroom ? taskBudget - 1 : taskBudget,
          configured  = Math.max(1, Math.floor(requestWidth) || textCount || 1),
          width       = hasHeadroom ? Math.min(configured, available) : configured,
          spans       = planEmbeddingSpans({textCount, chunkSize: width}),
          // Bounded by the budget AND by the work that exists: fanning out wider than the span count
          // would report an offer the batch cannot make.
          concurrency = Math.max(1, Math.min(Math.floor(available / width), spans.length || 1));

    return {
        spans,
        width,
        concurrency,
        taskBudget,
        reservedTasks: taskBudget - available,
        offeredTasks : concurrency * width
    }
}

/**
 * @summary Measures the durably carryable prefix from an arbitrary set of completed spans.
 *
 * **Why a prefix and not the whole completed set.** The consumer binds carried vectors to inputs BY
 * POSITION (`batchToEmbed.slice(0, completedTextCount)`), and the ordering guard refuses anything not
 * densely indexed from 0. A sparse carry is therefore not expressible without changing that consumer
 * contract; the longest contiguous prefix is the most work a caller can bind correctly.
 *
 * **Why `droppedChunkCount` is returned rather than ignored.** Under concurrency a span can complete
 * after a hole, and that work is unbindable and therefore lost. Reporting the count makes the loss
 * observable: silently discarding it is the regression this function exists to prevent, in a tidier
 * shape. A caller that reports zero is asserting no loss, not hoping for none.
 *
 * @param {Object} options
 * @param {Array<{offset: Number, count: Number}>} options.spans Spans from {@link planEmbeddingSpans}.
 * @param {Boolean[]} options.completedFlags Parallel to `spans`; `true` where that span landed.
 * @returns {{chunkCount: Number, textCount: Number, droppedChunkCount: Number}} Carryable prefix, plus completed-but-unbindable spans.
 */
export function resolveCompletedPrefix({spans, completedFlags}) {
    let chunkCount = 0,
        textCount  = 0;

    while (chunkCount < spans.length && completedFlags[chunkCount] === true) {
        textCount += spans[chunkCount].count;
        chunkCount++
    }

    const completedTotal = completedFlags.reduce((sum, landed) => landed === true ? sum + 1 : sum, 0);

    return {chunkCount, textCount, droppedChunkCount: completedTotal - chunkCount}
}
