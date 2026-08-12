/**
 * @summary A bounded-lane request scheduler that admits up to `capacity` tasks at a time (default
 * one), preferring interactive work over batch work.
 *
 * Local chat/embedding endpoints (LM Studio, `lms server`, Ollama, llama.cpp, MLX) serialize
 * model requests, so a long-running batch task — a 30-60m session-summary or a KB backfill — can
 * monopolize the endpoint and stall a latency-sensitive interactive request (an `ask` synthesis,
 * or the mini-summary fired right after `add_memory`). This queue bounds admission and,
 * whenever it picks the next task, prefers any waiting `interactive` task over `batch` work — so
 * interactive requests jump ahead of queued batch work without starving it (a batch task still
 * runs once no interactive work is waiting). Within a single priority lane, selection is FIFO.
 *
 * **`capacity` defaults to 1, which is the original single-lane behaviour exactly.** A capacity
 * above one exists for a consumer with its OWN serving endpoint: when `ask` synthesis is bound to a
 * dedicated endpoint, two asks arriving seconds apart must both be served, and a single-lane queue
 * serializes them no matter how much idle capacity that endpoint has — the bound is admission, not
 * the endpoint. Raising capacity against a SHARED endpoint would merely move contention downstream
 * into the model server, which is why the default stays 1 and the capacity travels with the
 * dedicated instance rather than the shared one.
 *
 * It controls admission ORDER, not in-flight cancellation: a local endpoint request is
 * non-preemptible, so an already-running task always finishes; the queue only decides which
 * waiting task starts next. A task that throws rejects its own promise and never blocks the lane.
 *
 * Mirrors the proven embedding-side scheduler in
 * `Neo.ai.services.memory-core.TextEmbeddingService` (`#enqueueOpenAiCompatiblePost` /
 * `#drainOpenAiCompatiblePostQueue` / `#getNextOpenAiCompatiblePostQueueIndex`), extracted as a
 * reusable provider-layer primitive. Deliberately a plain class, not a Neo singleton: the queue
 * holds transient mutable state, so an instantiable (injectable) object keeps it test-isolated —
 * a shared singleton would bleed queue state across tests.
 *
 * @class Neo.ai.provider.InteractiveBatchQueue
 */
export default class InteractiveBatchQueue {
    /**
     * Pending tasks, each carrying the task/promise controls plus bounded lifecycle timing state.
     * @member {Object[]} #queue=[]
     * @private
     */
    #queue = [];
    /**
     * How many tasks are executing right now. A COUNTER rather than a boolean: the boolean it
     * replaced could only express "a lane is busy", which cannot represent a freed slot among
     * several.
     * @member {Number} #running=0
     * @private
     */
    #running = 0;
    /**
     * Maximum tasks admitted concurrently. `1` reproduces the original single-lane scheduler.
     * @member {Number} #capacity=1
     * @private
     */
    #capacity = 1;
    /**
     * Injectable monotonic-enough wall clock for deterministic lifecycle receipts.
     * @member {Function} #now=Date.now
     * @private
     */
    #now = Date.now;

    /**
     * @summary Creates an isolated queue with an optional deterministic clock seam and admission bound.
     * @param {Object} [options]
     * @param {Function} [options.now=Date.now] Timestamp provider.
     * @param {Number} [options.capacity=1] Maximum concurrently admitted tasks. Validated eagerly:
     * a `0`, negative, fractional or non-numeric capacity would silently stall the lane forever or
     * admit unbounded work, and a scheduler that never runs a task is indistinguishable from a hung
     * provider from the caller's side.
     */
    constructor({now = Date.now, capacity = 1} = {}) {
        if (typeof now !== 'function') {
            throw new TypeError('InteractiveBatchQueue: options.now must be a function');
        }

        if (!Number.isInteger(capacity) || capacity < 1) {
            throw new TypeError(`InteractiveBatchQueue: options.capacity must be an integer >= 1, got ${capacity}`);
        }

        this.#now      = now;
        this.#capacity = capacity;
    }

    /**
     * @summary The configured admission bound, for observability and assertions.
     * @member {Number} capacity
     * @readonly
     */
    get capacity() {
        return this.#capacity
    }

    /**
     * @summary Enqueue an async task under a priority lane; resolves / rejects with the task's result.
     * @param {Function} task An async thunk `() => Promise<*>`, executed when the lane is free.
     * @param {'interactive'|'batch'} [priority='interactive'] Lane priority; interactive is preferred.
     * @param {Object} [lifecycle] Optional synchronous `onEnqueued/onStarted/onSettled` observer.
     * @returns {Promise<*>}
     */
    enqueue(task, priority = 'interactive', lifecycle = null) {
        const enqueuedAt = this.#now();

        this.#notify(lifecycle, 'onEnqueued', {enqueuedAt, priority});

        return new Promise((resolve, reject) => {
            this.#queue.push({task, priority, resolve, reject, lifecycle, enqueuedAt});
            this.#drain()
        })
    }

    /**
     * @summary Fills every free slot, selecting interactive work first.
     *
     * SYNCHRONOUS on purpose. Two `enqueue` calls arriving in the same tick must both be admitted
     * when capacity allows, so slot-filling cannot sit behind an `await` — an async gap here would
     * let the first task's dispatch delay the second, reintroducing the serialization this bound
     * exists to remove while still reporting a capacity above one.
     * @returns {void}
     * @private
     */
    #drain() {
        while (this.#running < this.#capacity && this.#queue.length > 0) {
            this.#runNext()
        }
    }

    /**
     * @summary Admits and executes one task, then re-drains so a freed slot pulls the next waiting
     * task. A throwing task rejects its own promise and always releases its slot.
     *
     * The next task is selected when a slot FREES, not when the queue was built, which is what keeps
     * the documented contract — "whenever it picks the next task, prefers any waiting interactive
     * task" — true under capacity above one.
     * @returns {Promise<void>}
     * @private
     */
    async #runNext() {
        const index = this.#nextIndex(),
              item  = this.#queue.splice(index, 1)[0];

        this.#running++;

        const startedAt = this.#now();

        this.#notify(item.lifecycle, 'onStarted', {
            enqueuedAt : item.enqueuedAt,
            priority   : item.priority,
            queueWaitMs: Math.max(0, startedAt - item.enqueuedAt),
            startedAt
        });

        try {
            const result      = await item.task(),
                  completedAt = this.#now();

            this.#notify(item.lifecycle, 'onSettled', {
                completedAt,
                enqueuedAt : item.enqueuedAt,
                executionMs: Math.max(0, completedAt - startedAt),
                priority   : item.priority,
                startedAt,
                success    : true
            });
            item.resolve(result)
        } catch (error) {
            const completedAt = this.#now();

            this.#notify(item.lifecycle, 'onSettled', {
                completedAt,
                enqueuedAt : item.enqueuedAt,
                error,
                executionMs: Math.max(0, completedAt - startedAt),
                priority   : item.priority,
                startedAt,
                success    : false
            });
            item.reject(error)
        } finally {
            // Release BEFORE re-draining, or the freed slot is invisible to the drain it triggers.
            this.#running--;
            this.#drain()
        }
    }

    /**
     * @summary Selects the next queue index — any waiting interactive task is preferred over batch,
     * and within a single lane selection stays FIFO (the earliest matching index wins).
     * @returns {Number}
     * @private
     */
    #nextIndex() {
        let best = 0;

        for (let i = 1; i < this.#queue.length; i++) {
            if (this.#queue[best].priority === 'batch' && this.#queue[i].priority === 'interactive') {
                best = i
            }
        }

        return best
    }

    /**
     * @summary Invokes one lifecycle callback without letting telemetry affect queue behavior.
     * @param {Object|null} lifecycle Optional lifecycle observer.
     * @param {String} method Observer method name.
     * @param {Object} event Bounded timing event.
     * @returns {void}
     * @private
     */
    #notify(lifecycle, method, event) {
        try {
            lifecycle?.[method]?.(event);
        } catch {
            // Observability is best-effort and cannot alter admission or task results.
        }
    }
}
