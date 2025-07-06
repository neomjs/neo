/**
 * A singleton manager to track the currently running effect.
 * This allows reactive properties to know which effect to subscribe to.
 * @class Neo.core.EffectManager
 * @singleton
 */
const EffectManager = {
    effectStack: [],

    /**
     * Returns the effect currently at the top of the stack (i.e., the one currently running).
     * @returns {Neo.core.Effect|null}
     */
    getActiveEffect() {
        return this.effectStack[this.effectStack.length - 1]
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
    }
};

const ns = Neo.ns('Neo.core', true);
ns.EffectManager = EffectManager;

export default EffectManager;
