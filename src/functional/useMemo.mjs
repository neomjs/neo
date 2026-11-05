import EffectManager from '../core/EffectManager.mjs';

const
    hookIndexSymbol = Symbol.for('hookIndex'),
    hooksSymbol     = Symbol.for('hooks');

/**
 * @summary A hook for memoizing computed values or VDOM subtrees within a functional component's `createVdom` method.
 *
 * `useMemo` caches the return value of `fn` in `component[Symbol.for('hooks')]` and skips re-executing `fn` when
 * its inputs are unchanged:
 * - Explicit mode (`useMemo(fn, [depA, depB])`): inputs are the union of `dependencies` (compared via `Object.is` with
 *   a deep `Neo.isEqual` fallback) and any `Neo.core.Config` instances read inside `fn` (compared via `Object.is` /
 *   `cfg.isEqual` while re-registering each config on the active `Effect`).
 * - Automatic mode (`useMemo(fn)`): tracks only `Neo.core.Config` reads executed inside `fn` (plain outer-scope
 *   variables are not tracked unless passed in `dependencies`).
 * - Usage rules: never call other hooks (`useConfig`, `useEvent`, `useMemo`) inside `fn` (cache hits skip `fn` and
 *   would shift hook indices). `FunctionalBase#processVdomForComponents` mutates returned VDOM child definitions into
 *   `{componentId}` references in place and preserves active child instances across cached renders.
 *
 * @function Neo.functional.useMemo
 * @param {Function} fn             The compute function whose return value should be memoized.
 * @param {Array}    [dependencies] Optional explicit dependency array compared via `Object.is` then `Neo.isEqual`.
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
        prevEntry    = component[hooksSymbol][currentIndex],
        hasDepsArray = Array.isArray(dependencies);

    component[hookIndexSymbol]++;

    EffectManager.resume();

    if (prevEntry) {
        const depsMatch = hasDepsArray
            ? Array.isArray(prevEntry.dependencies) &&
              dependencies.length === prevEntry.dependencies.length &&
              dependencies.every((dep, i) => Object.is(dep, prevEntry.dependencies[i]) || Neo.isEqual(dep, prevEntry.dependencies[i]))
            : prevEntry.dependencies === undefined && prevEntry.trackedConfigs.size > 0;

        if (depsMatch) {
            let configsUnchanged = true;

            for (const [cfg, prevVal] of prevEntry.trackedConfigs) {
                const currentVal = cfg.get();

                if (!Object.is(currentVal, prevVal) && !cfg.isEqual(currentVal, prevVal)) {
                    configsUnchanged = false
                }
            }

            if (configsUnchanged) {
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
        dependencies: hasDepsArray ? [...dependencies] : undefined,
        trackedConfigs,
        value
    };

    return value
}

export default useMemo;
