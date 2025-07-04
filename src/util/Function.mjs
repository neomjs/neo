const originalMethodSymbol = Symbol('originalMethod');
const sequencedFnsSymbol   = Symbol('sequencedFns');

/**
 * Append args instead of prepending them
 * @param {Function} fn
 * @param {Object} scope
 * @returns {Function}
 */
export function bindAppend(fn, scope) {
    const args = [].slice.call(arguments).slice(2);

    return function() {
        return fn.apply(scope, [].slice.call(arguments).concat(args))
    }
}

/**
 * @param {Function} callback
 * @param {Neo.core.Base} scope
 * @param {Number} delay=300
 * @returns {Function}
 */
export function buffer(callback, scope, delay=300) {
    let timeoutId;

    const wrapper = function(...args) {
        // callback invocation comes "delay" ms after the last call to wrapper
        // so cancel any pending invocation.
        clearTimeout(timeoutId);

        wrapper.isPending = true;

        timeoutId = setTimeout(() => {
            timeoutId = 0;
            wrapper.isPending = false;
            callback.apply(scope, args)
        }, delay)
    };

    wrapper.cancel = () => {
        wrapper.isPending = false;
        clearTimeout(timeoutId)
    };

    return wrapper
}

/**
 * Intended for functions with 1 param where the interceptor can change the value
 * @param {Object} target
 * @param {String} targetMethodName
 * @param {Function} interceptFunction
 * @param {Object} scope=target
 * @returns {Function}
 */
export function createInterceptor(target, targetMethodName, interceptFunction, scope) {
    let targetMethod = target[targetMethodName];

    return (target[targetMethodName] = function(value) {
        return targetMethod.call(target, interceptFunction.call(scope || target, value))
    })
}

/**
 * @param {Neo.core.Base} target
 * @param {String} methodName
 * @param {Function} fn
 * @param {Object} scope
 * @returns {Function}
 */
export function createSequence(target, methodName, fn, scope) {
    let currentMethod = target[methodName],
        wrapper;

    if (currentMethod && currentMethod[sequencedFnsSymbol]) {
        // Already a sequenced method, add to its list
        wrapper = currentMethod;
        wrapper[sequencedFnsSymbol].push({fn, scope})
    } else {
        // First time sequencing this method
        let originalMethod = currentMethod || Neo.emptyFn;

        wrapper = function() {
            originalMethod.apply(this, arguments); // Call the original method

            // Call all sequenced functions
            wrapper[sequencedFnsSymbol].forEach(seqFn => {
                seqFn.fn.apply(seqFn.scope || this, arguments);
            });
        };
        wrapper[sequencedFnsSymbol] = [{fn, scope}];
        wrapper[originalMethodSymbol] = originalMethod; // Store original method
    }

    return (target[methodName] = wrapper);
}

/**
 * @param {Function} callback
 * @param {Neo.core.Base} scope
 * @param {Number} delay=300
 * @returns {Function}
 */
export function debounce(callback, scope, delay=300) {
    let debounceTimer;

    return function(...args) {
        // leading edge => trigger the first call right away
        if (!Neo.isNumber(debounceTimer)) {
            // we need to check if the scope (instance) did not get destroyed yet
            scope?.id && callback.apply(scope, args);

            // we still want to start a timer to delay the 2nd+ update
            debounceTimer = setTimeout(() => {debounceTimer = null},  delay)
        } else {
            clearTimeout(debounceTimer);

            debounceTimer = setTimeout(() => {
                // we need to check if the scope (instance) did not get destroyed yet
                scope?.id && callback.apply(scope, args);
                debounceTimer = setTimeout(() => {debounceTimer = null},  delay)
            },  delay)
        }
    }
}

/**
 * The interceptor can prevent the targetMethod from getting executed in case it returns false.
 * @param {Object} target
 * @param {String} targetMethodName
 * @param {Function} interceptFunction
 * @param {Object} scope=target
 * @param {*} preventedReturnValue=null The value to return in case the interceptFunction returns false
 * @returns {Function}
 */
export function intercept(target, targetMethodName, interceptFunction, scope, preventedReturnValue=null) {
    let targetMethod = target[targetMethodName];

    return (target[targetMethodName] = function() {
        return (interceptFunction.apply(scope || target, arguments) === false)
            ? preventedReturnValue
            : targetMethod.apply(target, arguments)
    })
}

/**
 * Locate a callable function by name in the passed scope.
 *
 * If the name starts with 'up.', the parent Component chain is searched.
 *
 * This is used by manager.DomEvents & core.Observable.fire and by 'handler' function calls to resolve
 * string function names in the Component's own hierarchy.
 * @param {Function|String} fn A function, or the name of a function to find in the passed scope object/
 * @param {Object} scope=this The scope to find the function in if it is specified as a string.
 * @returns {Object}
 */
export function resolveCallback(fn, scope=this) {
    if (Neo.isString(fn)) {
        if (!scope[fn] && fn.startsWith('up.')) {
            fn = fn.slice(3);
            while (!scope[fn] && (scope = scope.parent));
        } else {
            scope = scope.getController?.()?.getHandlerScope(fn, null) || scope
        }

        fn = scope[fn]
    }

    return {fn, scope}
}

/**
 * @param {Function} callback
 * @param {Neo.core.Base} scope
 * @param {Number} delay=300
 * @returns {Function}
 */
export function throttle(callback, scope, delay=300) {
    let lastRanDate, timeoutId;

    return function(...args) {
        if (!lastRanDate) {
            // we need to check if the scope (instance) did not get destroyed yet
            scope?.id && callback.apply(scope, args);

            lastRanDate = Date.now()
        } else {
            clearTimeout(timeoutId)

            timeoutId = setTimeout(function() {
                if ((Date.now() - lastRanDate) >= delay) {
                    // we need to check if the scope (instance) did not get destroyed yet
                    scope?.id && callback.apply(scope, args);

                    lastRanDate = Date.now()
                }
            }, delay - (Date.now() - lastRanDate))
        }
    }
}

/**
 * @param {Neo.core.Base} target
 * @param {String} methodName
 * @param {Function} fn
 * @param {Object} scope
 */
export function unSequence(target, methodName, fn, scope) {
    let currentMethod = target[methodName];

    if (!currentMethod || !currentMethod[sequencedFnsSymbol]) {
        return // Not a sequenced method
    }

    const sequencedFunctions = currentMethod[sequencedFnsSymbol];

    // Filter out the function to unsequence
    currentMethod[sequencedFnsSymbol] = sequencedFunctions.filter(seqFn =>
        !(seqFn.fn === fn && seqFn.scope === scope)
    );

    if (currentMethod[sequencedFnsSymbol].length === 0) {
        // If no functions left, restore the original method
        target[methodName] = currentMethod[originalMethodSymbol]
    }
}
