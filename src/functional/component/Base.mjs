import Base             from '../../core/Base.mjs';
import ComponentManager from '../../manager/Component.mjs';
import Effect           from '../../core/Effect.mjs';
import Observable       from '../../core/Observable.mjs';
import VdomLifecycle    from '../../mixin/VdomLifecycle.mjs';

const
    hookIndexSymbol = Symbol.for('hookIndex'),
    hooksSymbol     = Symbol.for('hooks');

/**
 * @class Neo.functional.component.Base
 * @extends Neo.core.Base
 * @mixes Neo.core.Observable
 * @mixes Neo.component.mixin.VdomLifecycle
 */
class FunctionalBase extends Base {
    static config = {
        /**
         * @member {String} className='Neo.functional.component.Base'
         * @protected
         */
        className: 'Neo.functional.component.Base',
        /**
         * @member {String} ntype='functional-component'
         * @protected
         */
        ntype: 'functional-component',
        /**
         * @member {Neo.core.Base[]} mixins=[Observable, VdomLifecycle]
         */
        mixins: [Observable, VdomLifecycle],
        /**
         * The vdom markup for this component.
         * @member {Object} _vdom={}
         */
        _vdom: {}
    }

    /**
     * The setter will handle vdom updates automatically
     * @member {Object} vdom=this._vdom
     */
    get vdom() {
        return this._vdom
    }
    set vdom(value) {
        this._vdom = value;
        this.afterSetVdom(value, value)
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        Object.defineProperties(me, {
            [hookIndexSymbol]: {
                configurable: true,
                enumerable  : false,
                value       : 0,
                writable    : true
            },
            [hooksSymbol]: {
                configurable: true,
                enumerable: false,
                value     : [],
                writable  : true
            }
        });

        // Creates a reactive effect that re-executes createVdom() when dependencies change.
        me.vdomEffect = new Effect(() => {
            me[hookIndexSymbol] = 0;

            // By assigning to the public `vdom` property, we trigger the setter,
            // which in turn calls `afterSetVdom` from the VdomLifecycle mixin.
            // This ensures the standard component update process is followed.
            me.vdom = me.createVdom(me, me.data)
        }, me.id)
    }

    /**
     * Triggered after the id config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);

        oldValue && ComponentManager.unregister(oldValue);
        value    && ComponentManager.register(this)
    }

    /**
     * Override this method in your functional component to return its VDOM structure.
     * This method will be automatically re-executed when any of the component's configs change.
     * @param {Neo.functional.component.Base} config - Mental model: while it contains the instance, it makes it clear to access configs
     * @param {Object}                        data   - Convenience shortcut for accessing `state.Provider` data
     * @returns {Object} The VDOM structure for the component.
     */
    createVdom(config, data) {
        // This method should be overridden by subclasses
        return {}
    }

    /**
     *
     */
    destroy() {
        this.vdomEffect?.destroy();

        ComponentManager.unregister(this);

        super.destroy()
    }
}

export default Neo.setupClass(FunctionalBase);
