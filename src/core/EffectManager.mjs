/**
 * A singleton manager to track the currently running effect and control global effect execution.
 * It provides a centralized mechanism for pausing, resuming, and batching effect runs.
 * @class Neo.core.EffectManager
 * @singleton
 */
const EffectManager = {
    /**
     * A stack to keep track of the currently active effect and its predecessors.
     * @member {Neo.core.Effect[]} effectStack=[]
     * @protected
     */
    effectStack: [],
    /**
     * A counter to manage nested calls to pauseTracking() and resumeTracking(). The active effect collects no
     * dependencies while it is greater than 0. Each effect has its own: push() starts it at 0, pop() restores the
     * outer effect's.
     * @member {Number} trackingPauseCounter=0
     * @protected
     */
    trackingPauseCounter: 0,
    /**
     * The trackingPauseCounter of each effect below the active one, restored by pop().
     * @member {Number[]} trackingPauseStack=[]
     * @protected
     */
    trackingPauseStack: [],

    /**
     * True while dependency tracking is paused for the active effect.
     * @member {Boolean} isTrackingPaused
     * @protected
     */
    get isTrackingPaused() {
        return this.trackingPauseCounter > 0
    },
    /**
     * A counter to manage nested calls to pause() and resume(). Effect execution is
     * paused or batched while this counter is greater than 0.
     * @member {Number} pauseCounter=0
     * @protected
     */
    pauseCounter: 0,
    /**
     * A Set to store unique effects that are triggered while the manager is paused.
     * These effects will be run when resume() is called and the pauseCounter returns to 0.
     * @member {Set<Neo.core.Effect>} queuedEffects=new Set()
     * @protected
     */
    queuedEffects: new Set(),

    /**
     * Adds a `Neo.core.Config` instance as a dependency for the currently active effect,
     * unless dependency tracking is explicitly paused.
     * @param {Neo.core.Config} config The config instance to add as a dependency.
     */
    addDependency(config) {
        if (!this.isTrackingPaused) {
            this.getActiveEffect()?.addDependency(config)
        }
    },

    /**
     * Returns the effect currently at the top of the stack (i.e., the one currently running).
     * @returns {Neo.core.Effect|null}
     */
    getActiveEffect() {
        return this.effectStack[this.effectStack.length - 1]
    },

    /**
     * Checks if effect execution is currently paused or batched.
     * @returns {Boolean} True if the pauseCounter is greater than 0.
     */
    isPaused() {
        return this.pauseCounter > 0
    },

    /**
     * Pauses effect execution and begins batching.
     * Each call to pause() increments a counter, allowing for nested control.
     */
    pause() {
        this.pauseCounter++
    },

    /**
     * Disables dependency tracking for the currently active effect until the matching resumeTracking().
     * Each call increments a counter, allowing for nested control.
     * @protected
     */
    pauseTracking() {
        this.trackingPauseCounter++
    },

    /**
     * Pops the current effect from the stack and restores the tracking pause of the effect below it.
     * @returns {Neo.core.Effect|null}
     */
    pop() {
        this.trackingPauseCounter = this.trackingPauseStack.pop() ?? 0;
        return this.effectStack.pop()
    },

    /**
     * Pushes an effect onto the stack. It starts with tracking enabled, whatever the outer effect paused.
     * @param {Neo.core.Effect} effect The effect to push.
     */
    push(effect) {
        this.effectStack.push(effect);
        this.trackingPauseStack.push(this.trackingPauseCounter);
        this.trackingPauseCounter = 0
    },

    /**
     * Queues a unique effect to be run later.
     * @param {Neo.core.Effect} effect The effect to queue.
     * @protected
     */
    queue(effect) {
        this.queuedEffects.add(effect)
    },

    /**
     * Resumes effect execution. If the pause counter returns to zero and effects
     * have been queued, they will all be executed synchronously.
     */
    resume() {
        let me = this;

        if (me.pauseCounter > 0) {
            me.pauseCounter--;

            if (me.pauseCounter === 0 && me.queuedEffects.size > 0) {
                const effectsToRun = [...me.queuedEffects];
                me.queuedEffects.clear();
                effectsToRun.forEach(effect => effect.run())
            }
        }
    },

    /**
     * Ends the innermost pauseTracking(). Tracking resumes once the outermost pair ends; a call without a matching
     * pause does nothing.
     * @protected
     */
    resumeTracking() {
        if (this.trackingPauseCounter > 0) {
            this.trackingPauseCounter--
        }
    }
};

export default Neo.gatekeep(EffectManager, 'Neo.core.EffectManager', () => {
    /**
     * Wraps a function in a batch operation, ensuring that all effects triggered
     * within it are run only once after the function completes.
     * @function Neo.batch
     * @param {Function} fn The function to execute.
     */
    Neo.batch = function(fn) {
        EffectManager.pause();
        try {
            fn()
        } finally {
            // The public resume() method handles running queued effects.
            EffectManager.resume()
        }
    }
});
