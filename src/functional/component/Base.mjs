import Base           from '../../core/Base.mjs';
import Effect         from '../../core/Effect.mjs';
import Observable     from '../../core/Observable.mjs';
import VdomLifecycle  from '../../component/mixin/VdomLifecycle.mjs';

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
        mixins: [Observable, VdomLifecycle]
    }

    /**
     * The setter will handle vdom updates automatically
     * @member {Object} vdom=this._vdom
     */
    get vdom() {
        return this._vdom
    }
    set vdom(value) {
        this.afterSetVdom(value, value)
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // Creates a reactive effect that re-executes createVdom() when dependencies change.
        me.vdomEffect = new Effect(() => {
            // Assign to the private backing property to prevent immediate VDOM worker updates,
            // allowing the public vdom setter (via afterSetVdom) to manage the update cycle.
            me._vdom = this.createVdom(me, me.data);
            me.update()
        })
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
        super.destroy()
    }
}

Neo.setupClass(FunctionalBase);

export default FunctionalBase;
