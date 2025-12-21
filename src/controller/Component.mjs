import Base              from './Base.mjs';
import {resolveCallback} from '../util/Function.mjs';

/**
 * @class Neo.controller.Component
 * @extends Neo.controller.Base
 */
class Component extends Base {
    static config = {
        /**
         * @member {String} className='Neo.controller.Component'
         * @protected
         */
        className: 'Neo.controller.Component',
        /**
         * @member {String} ntype='component-controller'
         * @protected
         */
        ntype: 'component-controller',
        /**
         * @member {Neo.component.Base|null} component=null
         * @protected
         */
        component: null,
        /**
         * @member {Neo.controller.Component|null} parent_=null
         * @reactive
         */
        parent_: null,
        /**
         * @member {Object} references=null
         * @protected
         */
        references: null,
        /**
         * @member {String|null} windowId=null
         */
        windowId: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me          = this,
            {component} = me;

        me.references = {};

        if (component.isConstructed) {
            me.onComponentConstructed()
        } else {
            component.on('constructed', () => {
                me.onComponentConstructed()
            }, me, {once: true})
        }
    }

    /**
     * Triggered before the parent config gets changed
     * @param {Neo.controller.Component|null} value
     * @param {Neo.controller.Component|null} oldValue
     * @protected
     */
    beforeSetParent(value, oldValue) {
        return value || this.getParent()
    }

    /**
     * @param {String} handlerName
     * @param {Neo.component.Base|null} [component]
     * @returns {Neo.controller.Component|Boolean|null}
     */
    getHandlerScope(handlerName, component) {
        let me       = this,
            {parent} = me,
            handlerCb;

        if (component) {
            // Look for ths function *name* first in the Component itself.
            // If we find it, return true so calling code knows not to continue to search.
            handlerCb = resolveCallback(handlerName, component);

            // Handler fn is resolved in the Component or its own parent chain.
            // Return a status indicating that we do not need an early binding
            if (handlerCb.fn) {
                return true
            }
        }

        return Neo.isFunction(me[handlerName]) ?
            me : parent?.getHandlerScope(handlerName) || null
    }

    /**
     * Get the closest controller inside the components parent tree
     * @returns {Neo.controller.Component|null}
     */
    getParent() {
        let me       = this,
            {parent} = me;

        if (parent) {
            return parent
        }

        return me.component.parent?.getController() || null
    }

    /**
     * todo: update changed references (e.g. container.remove() then container.add() using the same key)
     * @param {String} name
     * @returns {*}
     */
    getReference(name) {
        let me        = this,
            component = me.references[name];

        if (!component) {
            component = me.component.down({reference: name});

            if (component) {
                me.references[name] = component
            }
        }

        return component || null
    }

    /**
     * Convenience shortcut
     * @param args
     * @returns {*}
     */
    getState(...args) {
        return this.getStateProvider().getData(...args)
    }

    /**
     * sameLevelOnly=false will return the closest stateProvider inside the component parent tree,
     * in case there is none on the same level.
     * @param {Boolean} [sameLevelOnly=false]
     */
    getStateProvider(sameLevelOnly=false) {
        let {component} = this;
        return sameLevelOnly ? component.stateProvider : component.getStateProvider()
    }

    /**
     * Convenience shortcut for accessing state.Provider based data.Stores
     * @param {String} key
     * @returns {Neo.data.Store}
     */
    getStore(key) {
        return this.getStateProvider().getStore(key)
    }

    /**
     * Override this method inside your view controllers as a starting point in case you need references
     * (instead of using onConstructed() inside your controller)
     */
    onComponentConstructed() {}

    /**
     * Will get called by component.Base: destroy() in case the component has a reference config
     * @param {Neo.component.Base} component
     */
    removeReference(component) {
        let me           = this,
            {references} = me,
            key;

        for (key in references) {
            if (component === references[key]) {
                delete references[key];
                break
            }
        }

        me.getParent()?.removeReference(component)
    }

    /**
     * Convenience shortcut
     * @param args
     */
    setState(...args) {
        this.getStateProvider().setData(...args)
    }
}

export default Neo.setupClass(Component);
