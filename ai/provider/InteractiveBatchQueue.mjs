/**
 * @summary A single-lane request scheduler that runs async tasks one at a time, preferring
 * interactive work over batch work.
 *
 * Local chat/embedding endpoints (LM Studio, `lms server`, Ollama, llama.cpp, MLX) serialize
 * model requests, so a long-running batch task — a 30-60m session-summary or a KB backfill — can
 * monopolize the endpoint and stall a latency-sensitive interactive request (an `ask` synthesis,
 * or the mini-summary fired right after `add_memory`). This queue admits one task at a time and,
 * whenever it picks the next task, prefers any waiting `interactive` task over `batch` work — so
 * interactive requests jump ahead of queued batch work without starving it (a batch task still
 * runs once no interactive work is waiting). Within a single priority lane, selection is FIFO.
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
     * Pending tasks, each `{task, priority, resolve, reject}`.
     * @member {Object[]} #queue=[]
     * @private
     */
    #queue = [];
    /**
     * Whether the drain loop is currently running (guards against concurrent drains).
     * @member {Boolean} #active=false
     * @private
     */
    #active = false;

    /**
     * @summary Enqueue an async task under a priority lane; resolves / rejects with the task's result.
     * @param {Function} task An async thunk `() => Promise<*>`, executed when the lane is free.
     * @param {'interactive'|'batch'} [priority='interactive'] Lane priority; interactive is preferred.
     * @returns {Promise<*>}
     */
    enqueue(task, priority = 'interactive') {
        return new Promise((resolve, reject) => {
            this.#queue.push({task, priority, resolve, reject});
            this.#drain()
        })
    }

    /**
     * @summary Drains the queue one task at a time, selecting interactive work first. A throwing
     * task rejects its own promise without aborting the loop.
     * @returns {Promise<void>}
     * @private
     */
    async #drain() {
        if (this.#active) {
            return
        }

        this.#active = true;

        try {
            while (this.#queue.length > 0) {
                const index = this.#nextIndex(),
                      item  = this.#queue.splice(index, 1)[0];

                try {
                    item.resolve(await item.task())
                } catch (error) {
                    item.reject(error)
                }
            }
        } finally {
            this.#active = false
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
}
