import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Function
 * @extends Neo.core.Base
 */
class NeoFunction extends Base {
    static config = {
        /**
         * @member {String} className='Neo.util.Function'
         * @protected
         */
        className: 'Neo.util.Function'
    }

    /**
     * Append args instead of prepending them
     * @param {Object} scope
     * @returns {Function}
     */
    static bindAppend(scope) {
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
    static createInterceptor(target, targetMethodName, interceptFunction, scope) {
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
    static createSequence(target, methodName, fn, scope) {
        let method = target[methodName] || Neo.emptyFn;

        return (target[methodName] = function() {
            method.apply(this, arguments);
            return fn.apply(scope || this, arguments);
        })
    }

    /**
     * @param {Function} func
     * @param {Neo.core.Base} scope
     * @param {Number} timeout
     * @returns {Function}
     */
    static debounce(func, scope, timeout=300) {
        let debounceTimer;

        return async function(...args) {
            clearTimeout(debounceTimer);

            debounceTimer = setTimeout(() => {
                // we need to check if the scope (instance) did not get destroyed yet
                scope?.id && func.apply(scope, args);
            },  timeout)
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
    static intercept(target, targetMethodName, interceptFunction, scope, preventedReturnValue=null) {
        let targetMethod = target[targetMethodName];

        return (target[targetMethodName] = function() {
            return (interceptFunction.apply(scope || target, arguments) === false)
                ? preventedReturnValue
                : targetMethod.apply(target, arguments)
        })
    }
}

Neo.applyClassConfig(NeoFunction);

export default NeoFunction;
