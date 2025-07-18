/**
 * A singleton manager to track the currently running effect.
 * This allows reactive properties to know which effect to subscribe to.
 * @class Neo.core.EffectManager
 * @singleton
 */
const EffectManager = {
    effectStack: [],
    isPaused   : false,

    /**
     * Adds a `Neo.core.Config` instance as a dependency for the currently active effect.
     * This method checks if the EffectManager is paused before adding the dependency.
     * @param {Neo.core.Config} config The config instance to add as a dependency.
     */
    addDependency(config) {
        !this.isPaused && this.getActiveEffect()?.addDependency(config)
    },

    /**
     * Returns the effect currently at the top of the stack (i.e., the one currently running).
     * @returns {Neo.core.Effect|null}
     */
    getActiveEffect() {
        return this.effectStack[this.effectStack.length - 1]
    },

    /**
     * Pauses dependency tracking for effects. While paused, calls to `addDependency` will be ignored.
     */
    pause() {
        this.isPaused = true;
    },

    /**
     * Pops the current effect from the stack, returning to the previous effect (if any).
     * @returns {Neo.core.Effect|null}
     */
    pop() {
        return this.effectStack.pop()
    },

    /**
     * Pushes an effect onto the stack, marking it as the currently running effect.
     * @param {Neo.core.Effect} effect The effect to push.
     */
    push(effect) {
        this.effectStack.push(effect)
    },

    /**
     * Resumes dependency tracking for effects.
     */
    resume() {
        this.isPaused = false;
    }
};

export default Neo.gatekeep(EffectManager, 'Neo.core.EffectManager');

