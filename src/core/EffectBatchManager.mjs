/**
 * A singleton manager responsible for batching `Neo.core.Effect` executions.
 * This ensures that effects triggered by multiple config changes within a single
 * synchronous operation (e.g., `Neo.core.Base#set()`) are executed only once
 * per batch, after all changes have been applied.
 * @class Neo.core.EffectBatchManager
 * @singleton
 */
const EffectBatchManager = {
    /**
     * The current count of active batch operations.
     * Incremented by `startBatch()`, decremented by `endBatch()`.
     * @member {Number} batchCount=0
     */
    batchCount: 0,
    /**
     * A Set of `Neo.core.Effect` instances that are pending execution within the current batch.
     * @member {Set<Neo.core.Effect>} pendingEffects=new Set()
     */
    pendingEffects: new Set(),

    /**
     * Decrements the batch counter. If `batchCount` reaches 0, all queued effects
     * are executed and the `pendingEffects` Set is cleared.
     */
    endBatch() {
        const me = this;

        me.batchCount--;

        if (me.batchCount === 0) {
            const effectsToRun = [...me.pendingEffects]; // Create a snapshot
            me.pendingEffects.clear();

            effectsToRun.forEach(effect => {
                effect.run()
            })
        }
    },

    /**
     * Checks if there is an active batch operation.
     * @returns {Boolean}
     */
    isBatchActive() {
        return this.batchCount > 0
    },

    /**
     * Queues an effect for execution at the end of the current batch.
     * If the effect is already queued, it will not be added again.
     * @param {Neo.core.Effect} effect The effect to queue.
     */
    queueEffect(effect) {
        this.pendingEffects.add(effect)
    },

    /**
     * Increments the batch counter. When `batchCount` is greater than 0,
     * effects will be queued instead of running immediately.
     */
    startBatch() {
        this.batchCount++
    }
};

export default Neo.gatekeep(EffectBatchManager, 'Neo.core.EffectBatchManager');
