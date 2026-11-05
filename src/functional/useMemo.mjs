import EffectManager from '../core/EffectManager.mjs';

const
    hookIndexSymbol = Symbol.for('hookIndex'),
    hooksSymbol     = Symbol.for('hooks');

/**
 * @summary A hook for memoizing computed values or VDOM subtrees within a functional component's `createVdom` method.
 *
 * `useMemo` caches the return value of `fn` in the component's hook slot (`component[Symbol.for('hooks')]`) and skips
 * re-executing `fn` on subsequent renders when its inputs have not changed:
 * - When an explicit `dependencies` array is passed (`useMemo(fn, [depA, depB])`), each element is compared with its
 *   previous value via `Object.is`. Any `Neo.core.Config` instances read inside `fn` are also re-registered on the
 *   active `Effect` so reactive subscriptions survive cached renders.
 * - When `dependencies` is omitted (`useMemo(fn)`), `useMemo` automatically tracks every `Neo.core.Config` accessed
 *   during `fn()` via `EffectManager` and reuses the cached result whenever all tracked configs still hold the same
 *   values (`Object.is(config.get(), previousValue)`).
 *
 * @function Neo.functional.useMemo
 * @param {Function} fn             The compute function whose return value should be memoized.
 * @param {Array}    [dependencies] Optional explicit dependency array compared with `Object.is`.
 * @returns {*} The memoized return value of `fn`.
 */
export function useMemo(fn, dependencies) {
    EffectManager.pause();

    const
        effect    = EffectManager.getActiveEffect(),
        component = effect && Neo.getComponent(effect.componentId);

    if (!component) {
        EffectManager.resume();
        throw new Error('useMemo must be called from within a functional component\'s createVdom method.')
    }

    const
        currentIndex = component[hookIndexSymbol],
        prevEntry    = component[hooksSymbol][currentIndex];

    component[hookIndexSymbol]++;

    EffectManager.resume();

    if (prevEntry) {
        if (Array.isArray(dependencies)) {
            if (
                Array.isArray(prevEntry.dependencies) &&
                dependencies.length === prevEntry.dependencies.length &&
                dependencies.every((dep, i) => Object.is(dep, prevEntry.dependencies[i]) || Neo.isEqual(dep, prevEntry.dependencies[i]))
            ) {
                prevEntry.trackedConfigs.forEach((val, cfg) => effect.addDependency(cfg));
                return prevEntry.value
            }
        } else if (prevEntry.dependencies === undefined && prevEntry.trackedConfigs.size > 0) {
            let unchanged = true;

            for (const [cfg, prevVal] of prevEntry.trackedConfigs) {
                const currentVal = cfg.get();

                if (!Object.is(currentVal, prevVal) && !cfg.isEqual(currentVal, prevVal)) {
                    unchanged = false
                }
            }

            if (unchanged) {
                return prevEntry.value
            }
        }
    }

    const
        trackedConfigs  = new Map(),
        collectorEffect = {
            componentId: effect.componentId,
            addDependency(cfg) {
                effect.addDependency(cfg);
                EffectManager.pauseTracking();
                trackedConfigs.set(cfg, cfg.get());
                EffectManager.resumeTracking()
            }
        };

    EffectManager.push(collectorEffect);

    let value;

    try {
        value = fn()
    } finally {
        EffectManager.pop()
    }

    component[hooksSymbol][currentIndex] = {
        dependencies: Array.isArray(dependencies) ? [...dependencies] : undefined,
        trackedConfigs,
        value
    };

    return value
}

export default useMemo;
