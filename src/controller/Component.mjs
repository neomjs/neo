import Base              from './Base.mjs';
import {resolveCallback} from '../util/Function.mjs';
import Logger            from '../util/Logger.mjs';

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
         */
        parent_: null,
        /**
         * @member {Object} references=null
         * @protected
         */
        references: null,
        /**
         * @member {Number|null} windowId=null
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
     * @param {Neo.component.Base} [component]
     * @returns {Neo.controller.Component|Boolean|null}
     */
    getHandlerScope(handlerName, component) {
        let me       = this,
            {parent} = me;

        if (component) {
            // Look for ths function *name* first in the Component itself.
            // If we find it, return true so calling code knows not to continue to search.
            const handlerCb = resolveCallback(handlerName, component);

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
     * @param {Neo.component.Base} component=this.component
     */
    parseConfig(component=this.component) {
        let me = this,
            {handler, listeners, reference, validator} = component,
            eventHandler, handlerScope;

        if (handler && typeof handler === 'string') {
            handlerScope = me.getHandlerScope(handler, component);

            // If the handler name was not resolved in the Component itself, bind it
            if (handlerScope !== true) {
                component.handler = handlerScope[handler].bind(component.handlerScope || handlerScope);
            }
        }

        listeners && Object.entries(listeners).forEach(([key, value]) => {
            if (key !== 'scope' && key !== 'delegate') {
                if (Neo.isString(value)) {
                    eventHandler = value;
                    handlerScope = me.getHandlerScope(eventHandler, component);

                    if (!handlerScope) {
                        Logger.logError('Unknown event handler for', eventHandler, component)
                    } else if (handlerScope !== true) {
                        listeners[key] = {};
                        listeners[key].fn = handlerScope[eventHandler].bind(handlerScope)
                    }
                } else {
                    value.forEach(listener => {
                        if (Neo.isObject(listener) && listener.hasOwnProperty('fn') && Neo.isString(listener.fn)) {
                            eventHandler = listener.fn;
                            handlerScope = me.getHandlerScope(eventHandler, component);

                            if (!handlerScope) {
                                console.error('Unknown event handler for', eventHandler, component)
                            } else if (handlerScope !== true) {
                                listener.fn = handlerScope[eventHandler].bind(handlerScope)
                            }
                        }
                    })
                }
            }
        });

        if (Neo.isString(validator)) {
            handlerScope = me.getHandlerScope(validator);

            if (!handlerScope) {
                Logger.logError('Unknown validator for', component.id, component)
            } else {
                component.validator = handlerScope[validator].bind(handlerScope)
            }
        }

        if (reference) {
            me.references[reference] = component
        }
    }

    /**
     * @param {Neo.component.Base} component=this.component
     */
    parseDomListeners(component=this.component) {
        let me             = this,
            {domListeners} = component,
            eventHandler, scope;

        domListeners?.forEach(domListener => {
            Object.entries(domListener).forEach(([key, value]) => {
                eventHandler = null;

                if (key !== 'scope' && key !== 'delegate') {
                    if (Neo.isString(value)) {
                        eventHandler = value;
                    } else if (Neo.isObject(value) && value.hasOwnProperty('fn') && Neo.isString(value.fn)) {
                        eventHandler = value.fn;
                    }

                    if (eventHandler) {
                        scope = me.getHandlerScope(eventHandler);

                        // There can be string based listeners like 'up.onClick', which will resolved inside manager.DomEvents
                        // => Do nothing in case there is no match inside the controller hierarchy.
                        if (scope) {
                            domListener[key] = scope[eventHandler].bind(scope)
                        }
                    }
                }
            })
        })
    }

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
