import EffectManager from '../core/EffectManager.mjs';

const pendingDomEventsSymbol = Symbol.for('pendingDomEvents');

/**
 * A hook for registering DOM event listeners within a functional component.
 * Event listeners registered via this hook will be managed by Neo.mjs's
 * delegated DOM event system, ensuring efficient and proper lifecycle handling.
 *
 * @param {String} eventType - The type of DOM event to listen for (e.g., 'click', 'input').
 * @param {Function} handler - The event handler function. It will receive the event data as its argument.
 * @param {String} [delegate] - An optional CSS selector for event delegation. If provided,
 *                               the handler will only fire if the event target matches this selector.
 */
export function useEvent(eventType, handler, delegate) {
    const
        activeEffect = EffectManager.getActiveEffect(),
        componentId  = activeEffect?.componentId;

    if (!componentId) {
        throw new Error('useEvent must be called from within a functional component\'s createVdom method.')
    }

    EffectManager.pause();
    const component = Neo.getComponent(componentId);
    EffectManager.resume();

    if (!component) {
        throw new Error(`Component with id ${componentId} not found for useEvent hook.`);
    }

    // Ensure pendingDomEventsSymbol exists on the component instance
    component[pendingDomEventsSymbol] ??= [];

    // Add the event listener configuration to the component's pending list
    component[pendingDomEventsSymbol].push({
        [eventType]: handler,
        delegate,
        scope      : component // The component instance itself will be the scope
    })
}

export default useEvent;
