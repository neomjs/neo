/**
 * Append args instead of prepending them
 * @param {Object} scope
 * @returns {Function}
 */
export function bindAppend(scope) {
    const fn   = this,
          args = [].slice.call(arguments).slice(1);

    return function() {
        return fn.apply(scope, [].slice.call(arguments).concat(args))
    }
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
    let method = target[methodName] || Neo.emptyFn;

    return (target[methodName] = function() {
        method.apply(this, arguments);
        return fn.apply(scope || this, arguments);
    })
}

/**
 * @param {Function} func
 * @param {Neo.core.Base} scope
 * @param {Number} timeout=300
 * @returns {Function}
 */
export function debounce(func, scope, timeout=300) {
    let debounceTimer;

    return function(...args) {
        // leading edge => trigger the first call right away
        if (!Neo.isNumber(debounceTimer)) {
            // we need to check if the scope (instance) did not get destroyed yet
            scope?.id && func.apply(scope, args);

            // we still want to start a timer, do delay the 2nd+ update
            debounceTimer = setTimeout(() => {debounceTimer = null},  timeout)
        } else {
            clearTimeout(debounceTimer);

            debounceTimer = setTimeout(() => {
                // we need to check if the scope (instance) did not get destroyed yet
                scope?.id && func.apply(scope, args);
                debounceTimer = setTimeout(() => {debounceTimer = null},  timeout)
            },  timeout)
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
 * @param {Function} callback
 * @param {Neo.core.Base} scope
 * @param {Number} delay=300
 * @returns {Function}
 */
export function throttle(callback, scope, delay=300) {
    let wait = false;

    return function(...args) {
        if (!wait) {
            wait = true;

            // we need to check if the scope (instance) did not get destroyed yet
            scope?.id && callback.apply(scope, args);

            setTimeout(() => {wait = false}, delay)
        }
    }
}
