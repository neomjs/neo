import Config        from '../core/Config.mjs';
import EffectManager from '../core/EffectManager.mjs';

const
    hookIndexSymbol = Symbol.for('hookIndex'),
    hooksSymbol     = Symbol.for('hooks');

/**
 * A hook for managing reactive state within a functional component's `createVdom` method.
 * It mirrors the behavior of React's `useState` but is powered by `Neo.core.Config` for reactivity.
 * @param {*} initialValue The initial value for the state.
 * @returns {Array<any>} A tuple containing the current value and a setter function.
 */
export function useConfig(initialValue) {
    EffectManager.pause();

    const
        effect    = EffectManager.getActiveEffect(),
        component = effect && Neo.getComponent(effect.componentId);

    if (!component) {
        throw new Error('useConfig must be called from within a functional component\'s createVdom method.')
    }

    const currentIndex = component[hookIndexSymbol];

    // Increment the index for the next hook call within the same component render cycle.
    component[hookIndexSymbol]++;

    // If this is the first time this hook is being called for this component, initialize its state.
    if (!component[hooksSymbol][currentIndex]) {
        const config = new Config(initialValue);

        const customSetter = (newValue) => {
            if (typeof newValue === 'function') {
                newValue = newValue(config.get())
            }
            config.set(newValue)
        };

        component[hooksSymbol][currentIndex] = [config, customSetter]
    }

    const [config, setter] = component[hooksSymbol][currentIndex];

    EffectManager.resume();

    // Call config.get() to ensure this component's effect tracks this config as a dependency.
    return [config.get(), setter]
}

export default useConfig;
