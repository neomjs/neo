import Base from '../core/Base.mjs';

/**
 * @class Neo.util.Function
 * @extends Neo.core.Base
 */
class NeoFunction extends Base {
    static getConfig() {return {
        className: 'Neo.util.Function'
    }}

    static createSequence(target, methodName, fn, scope) {
        let method = target[methodName] || Neo.emptyFn;

        return (target[methodName] = function() {
            method.apply(this, arguments);
            return fn.apply(scope || this, arguments);
        });
    }

    static intercept(target, methodName, fn, scope) {
        let method = target[methodName] || Neo.emptyFn;

        return (target[methodName] = function() {
            let returnValue = fn.apply(scope || this, arguments);
            method.apply(this, arguments);

            return returnValue;
        });
    }
}

Neo.applyClassConfig(NeoFunction);

export default NeoFunction;